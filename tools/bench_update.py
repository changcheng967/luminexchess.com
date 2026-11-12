#!/usr/bin/env python3
"""Bring the site's numbers up to date from OpenBench.

    python -I tools/bench_update.py                 read the bench and report; nothing is written
    python -I tools/bench_update.py --write         also write the counters and dates into the pages
    python -I tools/bench_update.py --from DIR      use saved pages (index1.html ..., users.html) instead of fetching
    python -I tools/bench_update.py --via ""        fetch directly instead of through `ssh -n oracle`

What it reads
    https://bench.luminexchess.com/index/N    every workload: kind, games, Elo, LLR
    https://bench.luminexchess.com/users/     the bench's own count of games played

What it reports
    - the totals the pages show: SPRTs run, passed, and games (the bench's own count, which
      includes games of workloads that were deleted later; the list's sum does not);
    - finished SPRTs that are missing from site/assets/data/tests.json, each as an entry ready
      to paste (the title is yours to write: one plain line saying what the change was);
    - rows of tests.json whose games or Elo no longer match the bench.

What --write changes
    - "Test games" in the home page's opening and the three totals on the home and tests pages;
    - the sentence under the tests page's totals (how many of each kind, and the games by kind);
    - the "as of" date in tests.json, on the home page's chart and on the tests page.
    Then run `python -I tools/stamp.py site`. Titles, labels and the notes under the record
    stay hand-written.

By default the bench is fetched through `ssh -n oracle curl ...`, because not every network can
reach the domain; pass --via "" to fetch from this machine.
"""
import argparse
import datetime
import html
import json
import os
import re
import subprocess
import sys
import urllib.request

BENCH = "https://bench.luminexchess.com"
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "site")
N = "{:,}".format


def fetch(url, via):
    if via:
        cmd = via.split() + ["curl -sL --max-time 40 '%s'" % url]
        return subprocess.run(cmd, capture_output=True, timeout=90).stdout.decode("utf-8", "replace")
    with urllib.request.urlopen(url, timeout=40) as r:
        return r.read().decode("utf-8", "replace")


def text_of(markup):
    markup = re.sub(r"<script\b.*?</script>", " ", markup, flags=re.S | re.I)
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", markup)))


def workloads(pages):
    """Every workload on the index pages: {id: dict(kind, section, games, wld, elo, ci, llr, lo, hi)}."""
    out = {}
    for page in pages:
        s = re.sub(r"<script\b.*?</script>", " ", page, flags=re.S | re.I)
        section = "?"
        for m in re.finditer(r"(Active|Awaiting|Finished)\b|<a href=\"/(test|tune|datagen)/(\d+)/\"", s):
            if m.group(1):
                section = m.group(1)
                continue
            wid = int(m.group(3))
            if wid in out:
                continue
            nxt = re.search(r"<a href=\"/(?:test|tune|datagen)/(?!%d/)\d+/\"" % wid, s[m.end():])
            t = text_of(s[m.start(): m.end() + (nxt.start() if nxt else 4000)])
            llr = re.search(r"LLR: (-?[\d.]+) \((-?[\d.]+), (-?[\d.]+)\)", t)
            g = re.search(r"Games: (\d+) W: (\d+) L: (\d+) D: (\d+)", t)
            tune = re.search(r"(\d+)/(\d+) Games Played", t)
            elo = re.search(r"Elo: (-?[\d.]+) \+- ([\d.]+)", t)
            w = {"id": wid, "section": section, "kind": "sprt" if llr else ("tune" if tune else "fixed"),
                 "games": int(g.group(1)) if g else (int(tune.group(1)) if tune else 0),
                 "wld": tuple(int(x) for x in g.groups()[1:]) if g else None,
                 "elo": float(elo.group(1)) if elo else None, "ci": float(elo.group(2)) if elo else None}
            if llr:
                w["llr"], w["lo"], w["hi"] = (float(x) for x in llr.groups())
                w["status"] = "pass" if w["llr"] >= w["hi"] else ("fail" if w["llr"] <= w["lo"] else "stop")
            out[wid] = w
    return out


def signed(v, digits=1):
    s = ("%+." + str(digits) + "f") % v
    return s.replace("-", "−")          # a real minus sign, as in tests.json


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--write", action="store_true", help="write the counters and dates into the pages")
    ap.add_argument("--from", dest="src", default="", help="a folder of saved pages: index1.html ..., users.html")
    ap.add_argument("--via", default="ssh -n oracle", help='command that runs curl elsewhere ("" = fetch from here)')
    ap.add_argument("--date", default="", help='the "as of" date to write, e.g. "12 November 2026" (default: today)')
    a = ap.parse_args()

    # ---- read the bench
    pages = []
    if a.src:
        i = 1
        while os.path.exists(os.path.join(a.src, "index%d.html" % i)):
            pages.append(open(os.path.join(a.src, "index%d.html" % i), encoding="utf-8", errors="replace").read())
            i += 1
        users = open(os.path.join(a.src, "users.html"), encoding="utf-8", errors="replace").read()
    else:
        users = fetch(BENCH + "/users/", a.via)
        seen = 0
        for i in range(1, 40):
            page = fetch(BENCH + "/index/%d" % i, a.via)
            pages.append(page)
            count = len(workloads(pages))
            if count == seen:            # a page with nothing new: past the last one
                pages.pop()
                break
            seen = count
        users_after = fetch(BENCH + "/users/", a.via)
    ws = workloads(pages)
    if not ws:
        sys.exit("No workloads found: the bench did not answer, or its pages changed shape.")
    m = re.search(r"Username\s+Games\s+Tests.*?([\d,]{5,})\s+\d+", text_of(users))
    if not m:
        sys.exit("The users page did not give a count of games.")
    played = int(m.group(1).replace(",", ""))
    if not a.src:
        m2 = re.search(r"Username\s+Games\s+Tests.*?([\d,]{5,})\s+\d+", text_of(users_after))
        if m2 and int(m2.group(1).replace(",", "")) != played:
            print("note: games were being played while the pages were read; run again for a still count")

    kinds = {"sprt": [], "tune": [], "fixed": []}
    for w in ws.values():
        kinds[w["kind"]].append(w)
    games = {k: sum(w["games"] for w in v) for k, v in kinds.items()}
    listed = sum(games.values())
    gone = played - listed
    done = [w for w in kinds["sprt"] if w["section"] == "Finished"]
    passed = [w for w in done if w["status"] == "pass"]
    running = [w for w in ws.values() if w["section"] != "Finished"]

    print("workloads on the list: %d  (%d SPRTs, %d fixed-length matches, %d tuning runs; %d still running)"
          % (len(ws), len(kinds["sprt"]), len(kinds["fixed"]), len(kinds["tune"]), len(running)))
    print("SPRTs finished: %d  (passed %d, failed %d, stopped %d)"
          % (len(done), len(passed), sum(w["status"] == "fail" for w in done), sum(w["status"] == "stop" for w in done)))
    print("games: %s by the bench's own count; %s on the list (SPRTs %s, tunes %s, matches %s); %s in runs since deleted"
          % (N(played), N(listed), N(games["sprt"]), N(games["tune"]), N(games["fixed"]), N(gone)))
    if gone < 0:
        sys.exit("The list holds more games than the bench has counted: read the pages again.")

    # ---- compare with the record
    path = os.path.join(ROOT, "assets", "data", "tests.json")
    with open(path, encoding="utf-8") as fh:
        data = json.load(fh)
    have = {t["test"]: t for t in data["tests"]}
    left_off = set(data.get("leftOff", []))
    missing = [w for w in done if w["id"] not in have and w["id"] not in left_off]
    if missing:
        print("\nfinished SPRTs not in tests.json (write a title, check the label, then paste):")
        for w in sorted(missing, key=lambda w: -w["id"]):
            # the list shows an SPRT's LLR but not its Elo: that is on the test's own page
            if w["elo"] is None and not a.src:
                mo = re.search(r"Elo \| (-?[\d.]+) \+- ([\d.]+)", text_of(fetch(BENCH + "/test/%d/" % w["id"], a.via)))
                if mo:
                    w["elo"], w["ci"] = float(mo.group(1)), float(mo.group(2))
            label = {"pass": "Passed", "fail": "Failed", "stop": "Stopped, unresolved"}[w["status"]]
            text = "%s ± %.1f" % (signed(w["elo"]), w["ci"]) if w["elo"] is not None else "TODO: Elo ± interval from the test's page"
            print(json.dumps({"test": w["id"], "title": "TODO: what the change was, in one plain line", "href": BENCH + "/test/%d/" % w["id"],
                              "ref": "TODO", "games": w["games"], "elo": w["elo"], "ci": w["ci"],
                              "text": text, "status": w["status"], "label": label}, ensure_ascii=False) + ",")
    stale = []
    for t in data["tests"]:
        w = ws.get(t["test"])
        if w and w["games"] != t["games"]:
            stale.append("  test %d: tests.json has %s games; the bench has %s" % (t["test"], N(t["games"]), N(w["games"])))
    if stale:
        print("\nrows of tests.json that no longer match the bench:")
        print("\n".join(stale))
    unlisted = [t["test"] for t in data["tests"] if t["test"] not in ws]
    if unlisted:
        print("\nin tests.json but no longer on the bench's list: %s" % ", ".join(str(n) for n in unlisted))
    if not (missing or stale or unlisted):
        print("\ntests.json matches the bench.")

    if not a.write:
        print("\nnothing written (pass --write to update the counters and dates)")
        return

    # ---- write the counters
    today = a.date or datetime.date.today().strftime("%d %B %Y").lstrip("0")

    def sub(s, pattern, repl, count, where):
        out, n = re.subn(pattern, repl, s)
        if n != count:
            sys.exit("%s: expected %d place(s) for %s, found %d; nothing was written" % (where, count, pattern[:50], n))
        return out

    odo = r'(<dt>%s</dt><dd class="num[^"]*"><span data-odo>)[^<]+(</span>)'
    home = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()
    home = sub(home, r'(<dt>Test games</dt><dd><span class="proof-n" data-odo>)[\d,]+(</span>)', r"\g<1>%s\g<2>" % N(played), 1, "home")
    home = sub(home, odo % "SPRTs run", r"\g<1>%d\g<2>" % len(done), 1, "home")
    home = sub(home, odo % "Passed", r"\g<1>%d\g<2>" % len(passed), 1, "home")
    home = sub(home, odo % "OpenBench games", r"\g<1>%s\g<2>" % N(played), 1, "home")
    home = sub(home, r"(oldest on the left, as of )\d{1,2} \w+ \d{4}(\.)", r"\g<1>%s\g<2>" % today, 1, "home")

    tests = open(os.path.join(ROOT, "tests", "index.html"), encoding="utf-8").read()
    tests = sub(tests, odo % "SPRTs run", r"\g<1>%d\g<2>" % len(done), 1, "tests")
    tests = sub(tests, odo % "Passed", r"\g<1>%d\g<2>" % len(passed), 1, "tests")
    tests = sub(tests, odo % "OpenBench games", r"\g<1>%s\g<2>" % N(played), 1, "tests")
    tests = sub(tests, r"(newest first, as of )\d{1,2} \w+ \d{4}(\.)", r"\g<1>%s\g<2>" % today, 1, "tests")
    still = "" if not running else (", one of them still running" if len(running) == 1 else ", %d of them still running" % len(running))
    rest = "" if not gone else "; another %s were played in runs since deleted from the list" % N(gone)
    line = ("%d tests and tuning runs are on OpenBench's list%s: %d SPRTs, %d fixed-length matches and %d SPSA tuning runs. "
            "The SPRTs played %s of the games, the tuning runs %s and the matches %s%s."
            % (len(ws), still, len(kinds["sprt"]), len(kinds["fixed"]), len(kinds["tune"]), N(games["sprt"]), N(games["tune"]), N(games["fixed"]), rest))
    tests = sub(tests, r'(<p class="statline"[^>]*>)[^<]*(</p>)', lambda mo: mo.group(1) + line + mo.group(2), 1, "tests")
    data["asOf"] = today

    with open(os.path.join(ROOT, "index.html"), "w", encoding="utf-8", newline="\n") as fh:
        fh.write(home)
    with open(os.path.join(ROOT, "tests", "index.html"), "w", encoding="utf-8", newline="\n") as fh:
        fh.write(tests)
    with open(path, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(data, fh, ensure_ascii=False, indent=1)
        fh.write("\n")
    print("\nwritten: %d SPRTs, %d passed, %s games, as of %s. Now run: python -I tools/stamp.py site" % (len(done), len(passed), N(played), today))


if __name__ == "__main__":
    main()
