#!/usr/bin/env python3
"""Bring the site's numbers up to date from OpenBench, and from the Computer Chess Index.

    python -I tools/bench_update.py                 read the bench and report; nothing is written
    python -I tools/bench_update.py --write         also write the counters and dates into the pages
    python -I tools/bench_update.py --gauntlet 2    write site/assets/data/gauntlet.json from gauntlet 2's page
    python -I tools/bench_update.py --cci           write site/assets/data/cci.json from CCI's page for Luminex
    python -I tools/bench_update.py --from DIR      use saved pages (index1.html ..., users.html) instead of fetching
    python -I tools/bench_update.py --via ""        fetch directly instead of through `ssh -n oracle`

What it reads
    https://bench.luminexchess.com/index/N       every workload: kind, games, Elo, LLR
    https://bench.luminexchess.com/users/        the bench's own count of games played
    https://bench.luminexchess.com/gauntlet/N/   with --gauntlet: the rating and the table of opponents
    CCI's engines/Luminex.md on GitHub           the list's ratings of the release (also read for the
                                                 report, which says when cci.json is behind the page)

What it reports
    - the totals the pages show: SPRTs run, passed, and games (the bench's own count, which
      includes games of workloads that were deleted later; the list's sum does not);
    - finished SPRTs that are missing from site/assets/data/tests.json, each as an entry ready
      to paste (the title is yours to write: one plain line saying what the change was);
    - rows of tests.json whose games no longer match the bench;
    - rows whose Elo, interval or games differ from the test's own page. Every row's page is read
      for this (one remote call), because the site quotes each Elo as its page shows it, with two
      decimals, and the bench's intervals have changed with its code before. --no-pages skips it.

What --write changes
    - the count of games in the home page's ride (its last scale) and the three totals on the home and tests pages;
    - the sentence under the tests page's totals (how many of each kind, and the games by kind);
    - the "as of" date in tests.json, on the home page's chart and on the tests page (the UTC
      date, like every other date on the site: GitHub's, the bench's, the development builds');
    - the Elo, interval, games and text of every row that differs from its test page.
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

What --cci [VERSION] changes
    - site/assets/data/cci.json: what the Computer Chess Index, an independent rating list, says
      about one version (default: the release the home page names): the rating, its range and the
      number of games at each of the list's time controls, on the machine that has played the
      most of them, with the date the list's page was generated. tools/stamp.py writes the note
      under "Where it stands" from it, and calls the figures early readings while any range is
      wider than ± 50. The list adds games every day, so the figures move: run it again.

After any of these, run `python -I tools/stamp.py site`.

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
CCI_PAGE = "https://github.com/computer-chess-index/cci/blob/main/engines/Luminex.md"
CCI_RAW = "https://raw.githubusercontent.com/computer-chess-index/cci/main/engines/Luminex.md"
CCI_LIST = "https://github.com/computer-chess-index/cci/blob/main/lists/CCIRatings.csv"
CCI_LIST_RAW = "https://raw.githubusercontent.com/computer-chess-index/cci/main/lists/CCIRatings.csv"
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "site")
N = "{:,}".format
KINDS = ("sprt", "fixed", "gauntlet", "tune", "datagen")
# fields of gauntlet.json that are written by hand and kept when the same gauntlet is read again:
#   title    the figure's heading, e.g. "Against twelve rated engines" (default: "The development build, against … engines")
#   since    a sentence shown after the figure's text: what the engine has become since the gauntlet
#   noteEnd  a sentence added to the note under the rows
HAND_WRITTEN = ("title", "since", "noteEnd")


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
            # a data-generation run (its page is /datagen/N/) plays the engine against itself to make
            # positions to train on: games, but no match and no measurement
            kind = ("gauntlet" if key[0] == "gauntlet" else "datagen" if key[0] == "datagen"
                    else ("sprt" if llr else ("tune" if tune else "fixed")))
            w = {"id": key[1], "section": section, "kind": kind,
                 "games": int(g.group(1)) if g else (int(tune.group(1)) if tune else 0),
                 "wld": tuple(int(x) for x in g.groups()[1:]) if g else None,
                 "elo": float(elo.group(1)) if elo else None, "ci": float(elo.group(2)) if elo else None}
            if llr:
                w["llr"], w["lo"], w["hi"] = (float(x) for x in llr.groups())
                w["status"] = "pass" if w["llr"] >= w["hi"] else ("fail" if w["llr"] <= w["lo"] else "stop")
            out[key] = w
    return out


def signed(v, digits=2):
    s = ("%+." + str(digits) + "f") % v
    return s.replace("-", "−")          # a real minus sign, as in tests.json


def shown(elo, ci):
    """An Elo result as its test page shows it: two decimals, with the 95% interval."""
    return "%s ± %.2f" % (signed(elo), ci)


def page_result(page):
    """(Elo, interval, games) from a test's own page, or None if the page has no result."""
    t = text_of(page)
    e = re.search(r"Elo \| (-?[\d.]+) \+- ([\d.]+)", t)
    g = re.search(r"Games \| N: (\d+)", t)
    return (float(e.group(1)), float(e.group(2)), int(g.group(1))) if e and g else None


def fetch_tests(ids, via):
    """The pages of these tests, keyed by id. Through `via` they come back in one remote call."""
    ids = list(ids)
    if not ids:
        return {}
    if not via:
        return {i: fetch("%s/test/%d/" % (BENCH, i), via) for i in ids}
    remote = "for i in %s; do echo \"@@@PAGE $i\"; curl -sL --max-time 40 %s/test/$i/; echo; done" % (" ".join(str(i) for i in ids), BENCH)
    out = subprocess.run(via.split() + [remote], capture_output=True, timeout=900).stdout.decode("utf-8", "replace")
    pages = {}
    for chunk in out.split("@@@PAGE ")[1:]:
        head, _, body = chunk.partition("\n")
        if head.strip().isdigit():
            pages[int(head.strip())] = body
    return pages


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


# ---------------------------------------------------------------- the Computer Chess Index

def long_date(iso):
    """'2026-11-15' -> '15 November 2026', as the site writes a date."""
    return datetime.date.fromisoformat(iso).strftime("%d %B %Y").lstrip("0")


def cci_clock(text):
    """A time control as the site writes one: '8.0+0.08s' -> '8+0.08', '2m24s+1.12s' -> '144+1.12'."""
    base, inc = text.strip().split("+")
    m = re.fullmatch(r"(?:(\d+)m)?(?:([\d.]+)s?)?", base)
    return "%s+%s" % (whole(int(m.group(1) or 0) * 60 + float(m.group(2) or 0)), whole(inc.rstrip("s")))


def release_version():
    """The release the home page names (softwareVersion in its JSON-LD)."""
    with open(os.path.join(ROOT, "index.html"), encoding="utf-8") as fh:
        return re.search(r'"softwareVersion":\s*"([\d.]+)"', fh.read()).group(1)


def cci_list_places(listing, version, cells):
    """Where the version stands on CCI's complete list (one row an engine, its newest version, rated on the
    machine the list is kept on): its place at each time control among the engines rated there. Only when
    the list's row is this version and carries the same ratings as the cells, so place and figure agree."""
    import csv
    import io as _io
    try:
        rows = list(csv.DictReader(_io.StringIO(listing)))
    except csv.Error:
        return {}
    mine = next((r for r in rows if r.get("Engine") == "Luminex" and r.get("Version") == version), None)
    if not mine:
        return {}
    out = {}
    for x in cells:
        v = (mine.get(x["tc"]) or "").strip()
        if not v.lstrip("-").isdigit() or int(v) != x["elo"]:
            return {}
        rated = [int(r[x["tc"]]) for r in rows if (r.get(x["tc"]) or "").strip().lstrip("-").isdigit()]
        out[x["tc"]] = (1 + sum(1 for e in rated if e > x["elo"]), len(rated))
    return out


def read_cci(page, version, listing=""):
    """What CCI's page for Luminex says about one version, as cci.json keeps it.

    The page's last table has a row for every version, time control and machine: the rating, its
    range and the number of games. A version and a time control are written once and hold for the
    rows under them. Of the machines that have played the version, the one with the most time
    controls is taken (the page's first, if several have as many).
    """
    generated = re.search(r"Generated:\s*(\d{4}-\d\d-\d\d)", page).group(1)
    machines = dict(re.findall(r"^## Elo Ratings (\w+) <sub>\((.*)\)</sub>\s*$", page, flags=re.M))
    published = {}
    for v, day in re.findall(r"^\| ([\d.]+) \| (\d{4}-\d\d-\d\d) \|", page, flags=re.M):
        published.setdefault(v, day)
    rows, order, ver, tc = {}, [], None, None
    for line in page[page.index("## Detailed Evaluation Results"):].split("\n"):
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) < 6 or not re.fullmatch(r"-?\d+", cells[3]):
            continue
        ver, tc = cells[0] or ver, cells[1] or tc
        name, clock = re.match(r"(\w+)\s*<sub>\((.*?)\)</sub>", tc).groups()
        if ver not in rows:
            order.append(ver)
        rows.setdefault(ver, []).append({"machine": cells[2], "tc": name, "clock": cci_clock(clock),
                                         "elo": int(cells[3]), "range": int(cells[4]), "games": int(cells[5])})
    by = {}
    for r in rows.get(version, []):
        by.setdefault(r["machine"], []).append(r)
    listed = list(machines)
    machine = max(by, key=lambda k: (len(by[k]), -listed.index(k) if k in listed else -len(listed))) if by else None
    cells = sorted(by.get(machine, []), key=lambda r: float(r["clock"].split("+")[0]))
    # the machine's own table of versions: each figure's change over the version before, as the page gives it
    deltas, previous = {}, None
    if machine:
        sec = re.search(r"^## Elo Ratings %s <sub>.*?$(.*?)(?=^## |\Z)" % re.escape(machine), page, flags=re.M | re.S)
        if sec:
            lines = [l for l in sec.group(1).split("\n") if l.startswith("|")]
            head = [h.strip() for h in lines[0].strip().strip("|").split("|")] if lines else []
            tcs = [re.match(r"(\w+)", h).group(1) for h in head[2:5]] if len(head) >= 5 else []
            versions = [l.strip().strip("|").split("|") for l in lines[2:]]
            for i, row in enumerate(versions):
                if row[0].strip() == version:
                    for tc, cell in zip(tcs, row[2:5]):
                        d = re.search(r"\(([+-]?\d+)\)", cell)
                        if d:
                            deltas[tc] = int(d.group(1))
                    if i + 1 < len(versions) and re.fullmatch(r"[\d.]+", versions[i + 1][0].strip()):
                        previous = versions[i + 1][0].strip()
    places = cci_list_places(listing, version, cells) if listing else {}
    for r in cells:
        if r["tc"] in deltas and previous:
            r["delta"] = deltas[r["tc"]]
        if r["tc"] in places:
            r["rank"], r["of"] = places[r["tc"]]
    return {
        "note": "What the Computer Chess Index says about the release: its figure in \"Where it stands\" on the home page. "
                "Written by tools/bench_update.py --cci; run tools/stamp.py site afterwards.",
        "href": CCI_PAGE, "generated": long_date(generated), "version": version,
        "published": long_date(published[version]) if version in published else None,
        "newest": order[0] if order else None,              # the newest version the list has played
        "machine": machine, "machineName": machines.get(machine),
        "previous": previous if deltas else None, "listHref": CCI_LIST if places else None,
        "cells": [{k: r[k] for k in ("tc", "clock", "elo", "range", "games", "delta", "rank", "of") if k in r} for r in cells],
    }


def cci_line(c):
    if not c["cells"]:
        return "CCI, page of %s: v%s is not on it (the newest it has played: %s)" % (c["generated"], c["version"], c["newest"] or "none")
    return "CCI, page of %s: v%s on %s (%s): %s" % (
        c["generated"], c["version"], c["machine"], c["machineName"],
        "; ".join("%s %s %d ± %d from %s game%s" % (x["tc"], x["clock"], x["elo"], x["range"], N(x["games"]), "" if x["games"] == 1 else "s")
                  for x in c["cells"]))


# ---------------------------------------------------------------- main

def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(errors="replace")          # a console that cannot show a character prints "?" for it
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--write", action="store_true", help="write the counters and dates into the pages")
    ap.add_argument("--gauntlet", type=int, default=0, help="write gauntlet.json from this gauntlet's page")
    ap.add_argument("--cci", nargs="?", const="", default=None, metavar="VERSION",
                    help="write cci.json from CCI's page for Luminex (default version: the release the home page names)")
    ap.add_argument("--from", dest="src", default="", help="a folder of saved pages: index1.html ..., users.html, gauntletN.html, cci.md")
    ap.add_argument("--via", default="ssh -n oracle", help='command that runs curl elsewhere ("" = fetch from here)')
    ap.add_argument("--date", default="", help='the date to write, e.g. "12 November 2026" (default: today, in UTC)')
    ap.add_argument("--no-pages", action="store_true", help="do not read every row's test page (faster; Elo figures are then not checked)")
    a = ap.parse_args()
    # UTC, like the bench's and GitHub's own dates and the names of the development builds
    today = a.date or datetime.datetime.now(datetime.timezone.utc).strftime("%d %B %Y").lstrip("0")

    def cci_now(version):
        """CCI's page as cci.json would keep it, or None if the page did not come back."""
        page = (open(os.path.join(a.src, "cci.md"), encoding="utf-8", errors="replace").read() if a.src and os.path.exists(os.path.join(a.src, "cci.md"))
                else ("" if a.src else fetch(CCI_RAW, a.via)))
        if "## Detailed Evaluation Results" not in page or "Generated:" not in page:
            return None
        listing = (open(os.path.join(a.src, "cci.csv"), encoding="utf-8", errors="replace").read() if a.src and os.path.exists(os.path.join(a.src, "cci.csv"))
                   else ("" if a.src else fetch(CCI_LIST_RAW, a.via)))
        return read_cci(page, version, listing)

    cci_path = os.path.join(ROOT, "assets", "data", "cci.json")
    if a.cci is not None:
        data = cci_now(a.cci or release_version())
        if not data:
            sys.exit("CCI's page for Luminex did not come back, or it changed shape.")
        with open(cci_path, "w", encoding="utf-8", newline="\n") as fh:
            json.dump(data, fh, ensure_ascii=False, indent=1)
            fh.write("\n")
        print(cci_line(data))
        print("written to assets/data/cci.json. Now run: python -I tools/stamp.py site")
        return

    if a.gauntlet:
        page = (open(os.path.join(a.src, "gauntlet%d.html" % a.gauntlet), encoding="utf-8", errors="replace").read() if a.src
                else fetch("%s/gauntlet/%d/" % (BENCH, a.gauntlet), a.via))
        if 'id="opponents"' not in page:
            sys.exit("Gauntlet %d's page did not come back, or it changed shape." % a.gauntlet)
        path = os.path.join(ROOT, "assets", "data", "gauntlet.json")
        date, kept, previous = today, {}, None
        if os.path.exists(path):
            with open(path, encoding="utf-8") as fh:
                old = json.load(fh)
            if old.get("id") == a.gauntlet:
                kept = {k: old[k] for k in HAND_WRITTEN if old.get(k)}      # what was written by hand stays,
                previous = old.get("previous")            # and so does the gauntlet it is compared with
                if not a.date:                            # and the same gauntlet keeps the date it was first read
                    date = old.get("date", today)
            elif old.get("id"):
                # a new gauntlet: the one shown until now becomes the one the figure compares it with
                previous = {k: old[k] for k in ("id", "href", "date", "sha", "network", "tc", "each", "games",
                                                "list", "rating", "error", "fromGames") if k in old}
                previous["opponents"] = sorted(o["name"] for o in old.get("opponents", []))
        data = read_gauntlet(a.gauntlet, page, date)
        data.update(kept)
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

    print("workloads on the list: %d  (%d SPRTs, %d fixed-length matches, %d gauntlets, %d tuning runs, %d data-generation runs; %d not finished)"
          % (len(ws), len(kinds["sprt"]), len(kinds["fixed"]), len(kinds["gauntlet"]), len(kinds["tune"]), len(kinds["datagen"]), len(running)))
    print("SPRTs finished: %d  (passed %d, failed %d, stopped %d)"
          % (len(done), len(passed), sum(w["status"] == "fail" for w in done), sum(w["status"] == "stop" for w in done)))
    print("games: %s by the bench's own count; %s on the list (SPRTs %s, tunes %s, matches %s, gauntlets %s, data generation %s); %s in runs since deleted"
          % (N(played), N(listed), N(games["sprt"]), N(games["tune"]), N(games["fixed"]), N(games["gauntlet"]), N(games["datagen"]), N(gone)))
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
            text = shown(w["elo"], w["ci"]) if w["elo"] is not None else "TODO: Elo ± interval from the test's page"
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
    # Every Elo the record shows is its test page's: the page is read for each row. (The list gives
    # an SPRT's LLR, not its Elo, and the bench's intervals have changed with its code before.)
    off = []
    if not a.src and not a.no_pages:
        pages_by_id = fetch_tests([t["test"] for t in data["tests"]], a.via)
        for t in data["tests"]:
            got = page_result(pages_by_id.get(t["test"], ""))
            if not got:
                off.append((t, None))
            elif abs(got[0] - t["elo"]) > 0.004 or abs(got[1] - t["ci"]) > 0.004 or got[2] != t["games"] or t.get("text") != shown(got[0], got[1]):
                off.append((t, got))
        if off:
            print("\nrows of tests.json that differ from their test page%s:" % (" (corrected below)" if a.write else "; --write corrects them"))
            for t, got in off:
                print("  test %d: tests.json %s, %s games; the page %s" % (
                    t["test"], t.get("text"), N(t["games"]), "has no result" if not got else "%s, %s games" % (shown(got[0], got[1]), N(got[2]))))
    if not (missing or stale or unlisted or off):
        print("\ntests.json matches the bench%s." % ("" if a.src or a.no_pages else ", and every row its test page"))
    if kinds["gauntlet"]:
        gpath = os.path.join(ROOT, "assets", "data", "gauntlet.json")
        on_site = json.load(open(gpath, encoding="utf-8")).get("id") if os.path.exists(gpath) else None
        newest = max(w["id"] for w in kinds["gauntlet"] if w["section"] == "Finished") if any(w["section"] == "Finished" for w in kinds["gauntlet"]) else None
        if newest and newest != on_site:
            print("\nthe newest finished gauntlet is %d; the site shows %s (python -I tools/bench_update.py --gauntlet %d)" % (newest, on_site or "none", newest))
    # the Computer Chess Index adds games every day: say when its page has moved on from cci.json
    if os.path.exists(cci_path):
        with open(cci_path, encoding="utf-8") as fh:
            kept = json.load(fh)
        now = cci_now(release_version())
        if now and any(now.get(k) != kept.get(k) for k in ("version", "generated", "machine", "cells", "newest")):
            print("\nCCI's page has moved on from cci.json (python -I tools/bench_update.py --cci):")
            print("  the site:  " + cci_line(kept))
            print("  the list:  " + cci_line(now))

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
    home = sub(home, r'(data-wall-games>)[\d,]+(<)', r"\g<1>%s\g<2>" % N(played), 2, "home")     # the ride's last scale and its step (tools/wall.py writes it too)
    home = sub(home, odo % "SPRTs run", r"\g<1>%d\g<2>" % len(done), 1, "home")
    home = sub(home, odo % "Passed", r"\g<1>%d\g<2>" % len(passed), 1, "home")
    home = sub(home, odo % "OpenBench games", r"\g<1>%s\g<2>" % N(played), 1, "home")
    home = sub(home, r"(oldest on the left, as of )\d{1,2} \w+ \d{4}(\.)", r"\g<1>%s\g<2>" % today, 1, "home")

    tests = open(os.path.join(ROOT, "tests", "index.html"), encoding="utf-8").read()
    tests = sub(tests, odo % "SPRTs run", r"\g<1>%d\g<2>" % len(done), 1, "tests")
    tests = sub(tests, odo % "Passed", r"\g<1>%d\g<2>" % len(passed), 1, "tests")
    tests = sub(tests, odo % "OpenBench games", r"\g<1>%s\g<2>" % N(played), 1, "tests")
    tests = sub(tests, r"(newest first, as of )\d{1,2} \w+ \d{4}(\.?)", r"\g<1>%s\g<2>" % today, 1, "tests")

    def count(n, one, many):
        return "%d %s" % (n, one if n == 1 else many)

    parts = [count(len(kinds["sprt"]), "SPRT", "SPRTs"), count(len(kinds["fixed"]), "fixed-length match", "fixed-length matches")]
    played_by = ["The SPRTs played %s of the games" % N(games["sprt"]), "the tuning runs %s" % N(games["tune"]), "the matches %s" % N(games["fixed"])]
    if kinds["gauntlet"]:
        parts.append(count(len(kinds["gauntlet"]), "gauntlet", "gauntlets"))
        played_by.append("the gauntlets %s" % N(games["gauntlet"]))
    parts.append(count(len(kinds["tune"]), "SPSA tuning run", "SPSA tuning runs"))
    if kinds["datagen"]:
        parts.append(count(len(kinds["datagen"]), "run that plays the engine against itself for training data",
                           "runs that play the engine against itself for training data"))
        played_by.append("the training-data runs %s" % N(games["datagen"]))
    still = "" if not running else (", one of them not finished" if len(running) == 1 else ", %d of them not finished" % len(running))
    rest = "" if not gone else "; another %s were played in runs since deleted from the list" % N(gone)
    line = ("OpenBench's list holds %d runs%s: %s and %s. %s and %s%s."
            % (len(ws), still, ", ".join(parts[:-1]), parts[-1], ", ".join(played_by[:-1]), played_by[-1], rest))
    tests = sub(tests, r'(<p class="statline"[^>]*>)[^<]*(</p>)', lambda mo: mo.group(1) + line + mo.group(2), 1, "tests")
    data["asOf"] = today
    for t, got in off:                                    # the rows take their page's figures
        if got:
            t["elo"], t["ci"], t["games"], t["text"] = got[0], got[1], got[2], shown(got[0], got[1])

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
