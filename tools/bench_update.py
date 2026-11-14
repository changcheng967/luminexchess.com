#!/usr/bin/env python3
"""Bring the site's numbers up to date from OpenBench.

    python -I tools/bench_update.py                 read the bench and report; nothing is written
    python -I tools/bench_update.py --write         also write the counters and dates into the pages
    python -I tools/bench_update.py --gauntlet 2    write site/assets/data/gauntlet.json from gauntlet 2's page
    python -I tools/bench_update.py --from DIR      use saved pages (index1.html ..., users.html) instead of fetching
    python -I tools/bench_update.py --via ""        fetch directly instead of through `ssh -n oracle`

What it reads
    https://bench.luminexchess.com/index/N       every workload: kind, games, Elo, LLR
    https://bench.luminexchess.com/users/        the bench's own count of games played
    https://bench.luminexchess.com/gauntlet/N/   with --gauntlet: the rating and the table of opponents

What it reports
    - the totals the pages show: SPRTs run, passed, and games (the bench's own count, which
      includes games of workloads that were deleted later; the list's sum does not);
    - finished SPRTs that are missing from site/assets/data/tests.json, each as an entry ready
      to paste (the title is yours to write: one plain line saying what the change was);
    - rows of tests.json whose games no longer match the bench.

What --write changes
    - "Test games" in the home page's opening and the three totals on the home and tests pages;
    - the sentence under the tests page's totals (how many of each kind, and the games by kind);
    - the "as of" date in tests.json, on the home page's chart and on the tests page (the UTC
      date, like every other date on the site: GitHub's, the bench's, the development builds').
    Titles, labels and the notes under the record stay hand-written.

What --gauntlet N changes
    - site/assets/data/gauntlet.json, which tools/stamp.py draws the home page's gauntlet figure
      from, and from which it fills every <!--@g:...--> value in the pages and the footer (the
      rating, the build's date, the count of games). The gauntlet shown until then is kept in
      the file as "previous": the figure compares the two. The chronicle's chart point and its
      entry on the home page are written by hand, and the script lists every line that still
      quotes the gauntlet before.
      One field of that file is hand-written and kept: "since", a sentence the figure shows
      about what main has become after the gauntlet (a newer network, say). Remove it when a
      new gauntlet makes it untrue.

After either, run `python -I tools/stamp.py site`.

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
KINDS = ("sprt", "fixed", "gauntlet", "tune")


def fetch(url, via):
    if via:
        cmd = via.split() + ["curl -sL --max-time 40 '%s'" % url]
        return subprocess.run(cmd, capture_output=True, timeout=90).stdout.decode("utf-8", "replace")
    with urllib.request.urlopen(url, timeout=40) as r:
        return r.read().decode("utf-8", "replace")


def text_of(markup):
    markup = re.sub(r"<script\b.*?</script>", " ", markup, flags=re.S | re.I)
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", markup))).strip()


def workloads(pages):
    """Every workload on the index pages, keyed by (kind of page, id): tests, tunes and gauntlets."""
    out = {}
    for page in pages:
        s = re.sub(r"<script\b.*?</script>", " ", page, flags=re.S | re.I)
        section = "?"
        for m in re.finditer(r"(Active|Awaiting|Finished)\b|<a href=\"/(test|tune|datagen|gauntlet)/(\d+)/\"", s):
            if m.group(1):
                section = m.group(1)
                continue
            key = (m.group(2), int(m.group(3)))
            if key in out:
                continue
            nxt = re.search(r"<a href=\"/(?:test|tune|datagen|gauntlet)/\d+/\"", s[m.end():])
            t = text_of(s[m.start(): m.end() + (nxt.start() if nxt else 4000)])
            llr = re.search(r"LLR: (-?[\d.]+) \((-?[\d.]+), (-?[\d.]+)\)", t)
            g = re.search(r"Games: (\d+) W: (\d+) L: (\d+) D: (\d+)", t)
            tune = re.search(r"(\d+)/(\d+) Games Played", t)
            elo = re.search(r"Elo: (-?[\d.]+) \+- ([\d.]+)", t)
            kind = "gauntlet" if key[0] == "gauntlet" else ("sprt" if llr else ("tune" if tune else "fixed"))
            w = {"id": key[1], "section": section, "kind": kind,
                 "games": int(g.group(1)) if g else (int(tune.group(1)) if tune else 0),
                 "wld": tuple(int(x) for x in g.groups()[1:]) if g else None,
                 "elo": float(elo.group(1)) if elo else None, "ci": float(elo.group(2)) if elo else None}
            if llr:
                w["llr"], w["lo"], w["hi"] = (float(x) for x in llr.groups())
                w["status"] = "pass" if w["llr"] >= w["hi"] else ("fail" if w["llr"] <= w["lo"] else "stop")
            out[key] = w
    return out


def signed(v, digits=1):
    s = ("%+." + str(digits) + "f") % v
    return s.replace("-", "−")          # a real minus sign, as in tests.json


# ---------------------------------------------------------------- a gauntlet's page

def rows_of(page, anchor):
    """The rows of the table inside the element with this id, each a list of its cells' text."""
    i = page.index('id="%s"' % anchor)
    table = page[i: page.index("</table>", i)]
    return [[text_of(c) for c in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", r, flags=re.S)]
            for r in re.findall(r"<tr[^>]*>(.*?)</tr>", table, flags=re.S)]


def pm(cell):
    """'3463 ± 23' -> (3463.0, 23.0)"""
    a, b = re.match(r"\s*(-?[\d.]+)\s*±\s*([\d.]+)", cell).groups()
    return float(a), float(b)


def whole(v):
    """A number without a needless decimal part: 10.0 -> 10, '0.10' -> 0.1."""
    v = float(v)
    return int(v) if v == int(v) else v


def read_gauntlet(gid, page, date):
    text = text_of(page)
    sha = re.search(r"Dev Sha ([0-9a-f]{40})", text).group(1)
    net = re.search(r"Dev Network (\S+)", text).group(1)
    tc = re.search(r"Time ([\d.]+)\+([\d.]+)", text)
    each = int(re.search(r"Games Each (\d+)", text).group(1))
    g = re.search(r"Games \| N: (\d+) W: (\d+) L: (\d+) D: (\d+)", text)
    lists = []
    for r in rows_of(page, "ratings")[1:]:
        rating, err, own = float(r[1]), float(r[2].replace("±", "")), float(r[3].replace("±", ""))
        scale, scale_err = pm(r[5])
        lists.append({"list": r[0], "rating": whole(rating), "error": whole(err), "fromGames": whole(own), "spread": whole(float(r[4])),
                      "scale": scale, "scaleError": scale_err, "opponents": int(r[6]), "games": int(r[7])})
    head = rows_of(page, "opponents")[0]
    i = page.index('id="opponents"')
    tests = [int(n) for n in re.findall(r'class="gauntlet-opponent"><a href="/test/(\d+)/"', page[i: page.index("</table>", i)])]
    opponents, lost = [], 0
    for k, r in enumerate(rows_of(page, "opponents")[1:]):
        elo, elo_err = pm(r[8])
        implied, implied_err = pm(r[9])
        lost += int(r[11]) + int(r[12])
        opponents.append({"name": r[0], "test": tests[k] if k < len(tests) else None,
                          "rating": int(r[1]), "games": int(r[2].split("/")[0]), "w": int(r[3]), "l": int(r[4]), "d": int(r[5]),
                          "score": float(r[7].rstrip("%")), "elo": elo, "eloError": elo_err,
                          "implied": whole(implied), "impliedError": whole(implied_err), "expected": float(r[10].rstrip("%"))})
    main = next(x for x in lists if x["list"] == head[1])
    return {
        "note": "The gauntlet on the home page. Written by tools/bench_update.py --gauntlet %d; run tools/stamp.py site afterwards." % gid,
        "id": gid, "href": "%s/gauntlet/%d/" % (BENCH, gid), "date": date,
        "sha": sha, "network": re.sub(r"^luminex_|_i8\.nnue$", "", net), "tc": "%s+%s" % (whole(tc.group(1)), whole(tc.group(2))),
        "each": each, "games": int(g.group(1)), "w": int(g.group(2)), "l": int(g.group(3)), "d": int(g.group(4)),
        "lostOnTimeOrCrashed": lost,
        "list": main["list"], "rating": main["rating"], "error": main["error"], "fromGames": main["fromGames"],
        "spread": main["spread"], "scale": main["scale"], "scaleError": main["scaleError"],
        "lists": lists, "opponents": opponents,
    }


def still_quoting(previous):
    """Lines of the pages and parts that quote the gauntlet shown before: its rating or its count of games.

    The figure and the footer are left out: tools/stamp.py rewrites both.
    """
    needles = ["%s ± %s" % (previous.get("rating"), previous.get("error")), N(previous.get("games", 0))]
    files = []
    for folder, _, names in os.walk(ROOT):
        files += [os.path.join(folder, n) for n in names if n.endswith(".html")]
    parts = os.path.join(os.path.dirname(os.path.abspath(__file__)), "parts")
    files += [os.path.join(parts, n) for n in sorted(os.listdir(parts)) if n.endswith(".html")]
    found = []
    for path in sorted(files):
        with open(path, encoding="utf-8") as fh:
            text = fh.read()
        for region in ("gauntlet", "footer"):
            text = re.sub(r"<!-- @%s -->.*?<!-- /@%s -->" % (region, region),
                          lambda m: "\n" * m.group(0).count("\n"), text, flags=re.S)          # keep the line numbers
        for no, line in enumerate(text.split("\n"), 1):
            for needle in needles:
                at = line.find(needle)
                if at >= 0:
                    plain = re.sub(r"<[^>]+>", "", line[max(0, at - 70): at + len(needle) + 50]).strip()
                    found.append("%s:%d  ...%s..." % (os.path.relpath(path, os.path.dirname(ROOT)).replace(os.sep, "/"), no, plain))
                    break
    return found


# ---------------------------------------------------------------- main

def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(errors="replace")          # a console that cannot show a character prints "?" for it
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--write", action="store_true", help="write the counters and dates into the pages")
    ap.add_argument("--gauntlet", type=int, default=0, help="write gauntlet.json from this gauntlet's page")
    ap.add_argument("--from", dest="src", default="", help="a folder of saved pages: index1.html ..., users.html, gauntletN.html")
    ap.add_argument("--via", default="ssh -n oracle", help='command that runs curl elsewhere ("" = fetch from here)')
    ap.add_argument("--date", default="", help='the date to write, e.g. "12 November 2026" (default: today, in UTC)')
    a = ap.parse_args()
    # UTC, like the bench's and GitHub's own dates and the names of the development builds
    today = a.date or datetime.datetime.now(datetime.timezone.utc).strftime("%d %B %Y").lstrip("0")

    if a.gauntlet:
        page = (open(os.path.join(a.src, "gauntlet%d.html" % a.gauntlet), encoding="utf-8", errors="replace").read() if a.src
                else fetch("%s/gauntlet/%d/" % (BENCH, a.gauntlet), a.via))
        if 'id="opponents"' not in page:
            sys.exit("Gauntlet %d's page did not come back, or it changed shape." % a.gauntlet)
        path = os.path.join(ROOT, "assets", "data", "gauntlet.json")
        date, since, previous = today, None, None
        if os.path.exists(path):
            with open(path, encoding="utf-8") as fh:
                old = json.load(fh)
            if old.get("id") == a.gauntlet:
                since = old.get("since")                  # the hand-written sentence about main since then stays,
                previous = old.get("previous")            # and so does the gauntlet it is compared with
                if not a.date:                            # and the same gauntlet keeps the date it was first read
                    date = old.get("date", today)
            elif old.get("id"):
                # a new gauntlet: the one shown until now becomes the one the figure compares it with
                previous = {k: old[k] for k in ("id", "href", "date", "sha", "network", "tc", "each", "games",
                                                "list", "rating", "error", "fromGames") if k in old}
                previous["opponents"] = sorted(o["name"] for o in old.get("opponents", []))
        data = read_gauntlet(a.gauntlet, page, date)
        if since:
            data["since"] = since
        if previous:
            data["previous"] = previous
        with open(path, "w", encoding="utf-8", newline="\n") as fh:
            json.dump(data, fh, ensure_ascii=False, indent=1)
            fh.write("\n")
        print("gauntlet %d: %s ± %s on %s, %s games against %d opponents (%s, %s); written to assets/data/gauntlet.json"
              % (a.gauntlet, data["rating"], data["error"], data["list"], N(data["games"]), len(data["opponents"]), data["sha"][:8], data["network"]))
        print("tools/stamp.py redraws the figure and fills every <!--@g:...--> value in the pages and the footer.")
        print("By hand on the home page: the chronicle chart's last point (data-points, its headline and its hidden")
        print("table) and a chronicle entry. Then: python -I tools/stamp.py site")
        if previous:
            quoting = still_quoting(previous)
            if quoting:
                print("\nlines that still quote gauntlet %s (%s ± %s, %s games); history may stay, anything else is stale:"
                      % (previous.get("id"), previous.get("rating"), previous.get("error"), N(previous.get("games", 0))))
                for line in quoting:
                    print("  " + line)
        return

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

    kinds = {k: [] for k in KINDS}
    for w in ws.values():
        kinds[w["kind"]].append(w)
    games = {k: sum(w["games"] for w in v) for k, v in kinds.items()}
    listed = sum(games.values())
    gone = played - listed
    done = [w for w in kinds["sprt"] if w["section"] == "Finished"]
    passed = [w for w in done if w["status"] == "pass"]
    running = [w for w in ws.values() if w["section"] != "Finished"]

    print("workloads on the list: %d  (%d SPRTs, %d fixed-length matches, %d gauntlets, %d tuning runs; %d not finished)"
          % (len(ws), len(kinds["sprt"]), len(kinds["fixed"]), len(kinds["gauntlet"]), len(kinds["tune"]), len(running)))
    print("SPRTs finished: %d  (passed %d, failed %d, stopped %d)"
          % (len(done), len(passed), sum(w["status"] == "fail" for w in done), sum(w["status"] == "stop" for w in done)))
    print("games: %s by the bench's own count; %s on the list (SPRTs %s, tunes %s, matches %s, gauntlets %s); %s in runs since deleted"
          % (N(played), N(listed), N(games["sprt"]), N(games["tune"]), N(games["fixed"]), N(games["gauntlet"]), N(gone)))
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
    tests_on_bench = {w["id"]: w for w in ws.values() if w["kind"] in ("sprt", "fixed")}
    stale = []
    for t in data["tests"]:
        w = tests_on_bench.get(t["test"])
        if w and w["games"] != t["games"]:
            stale.append("  test %d: tests.json has %s games; the bench has %s" % (t["test"], N(t["games"]), N(w["games"])))
    if stale:
        print("\nrows of tests.json that no longer match the bench:")
        print("\n".join(stale))
    unlisted = [t["test"] for t in data["tests"] if t["test"] not in tests_on_bench]
    if unlisted:
        print("\nin tests.json but no longer on the bench's list: %s" % ", ".join(str(n) for n in unlisted))
    if not (missing or stale or unlisted):
        print("\ntests.json matches the bench.")
    if kinds["gauntlet"]:
        gpath = os.path.join(ROOT, "assets", "data", "gauntlet.json")
        shown = json.load(open(gpath, encoding="utf-8")).get("id") if os.path.exists(gpath) else None
        newest = max(w["id"] for w in kinds["gauntlet"] if w["section"] == "Finished") if any(w["section"] == "Finished" for w in kinds["gauntlet"]) else None
        if newest and newest != shown:
            print("\nthe newest finished gauntlet is %d; the site shows %s (python -I tools/bench_update.py --gauntlet %d)" % (newest, shown or "none", newest))

    if not a.write:
        print("\nnothing written (pass --write to update the counters and dates)")
        return

    # ---- write the counters
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

    def count(n, one, many):
        return "%d %s" % (n, one if n == 1 else many)

    parts = [count(len(kinds["sprt"]), "SPRT", "SPRTs"), count(len(kinds["fixed"]), "fixed-length match", "fixed-length matches")]
    played_by = ["The SPRTs played %s of the games" % N(games["sprt"]), "the tuning runs %s" % N(games["tune"]), "the matches %s" % N(games["fixed"])]
    if kinds["gauntlet"]:
        parts.append(count(len(kinds["gauntlet"]), "gauntlet", "gauntlets"))
        played_by.append("the gauntlets %s" % N(games["gauntlet"]))
    parts.append(count(len(kinds["tune"]), "SPSA tuning run", "SPSA tuning runs"))
    still = "" if not running else (", one of them not finished" if len(running) == 1 else ", %d of them not finished" % len(running))
    rest = "" if not gone else "; another %s were played in runs since deleted from the list" % N(gone)
    line = ("OpenBench's list holds %d runs%s: %s and %s. %s and %s%s."
            % (len(ws), still, ", ".join(parts[:-1]), parts[-1], ", ".join(played_by[:-1]), played_by[-1], rest))
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
