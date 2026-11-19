#!/usr/bin/env python3
"""Write the data of the wall of games: every run on the bench with its wins, draws and losses.

    python -I tools/wall.py            write site/assets/data/wall.json
    python -I tools/wall.py --via ""   run on the bench server itself

The site draws one cell for every game the bench has played. The counts come from the
bench server's own database, read-only, through `ssh oracle`: every run, the deleted ones
too, so that the cells add up to the bench's own count of games. A run's title comes from
site/assets/data/tests.json when the record lists it, an opponent's name from
site/assets/data/gauntlet.json.

What a cell's colour can mean, by the kind of run ("k"):
    s   an SPRT: the change under test against the engine without it; a win is the change's
    m   a fixed-length match against the engine named, or against Luminex itself
    g   one opponent's match of a gauntlet: a win is Luminex's
    t   a tuning run (SPSA): two settings of the same engine against each other; the site
        does not colour these by result
and its state ("s"): p passed, f failed, r still running, x deleted since, - finished
(a match or a tuning run has no verdict).

Only the counts are data. Within a run the site scatters the results with a seeded
shuffle: the bench's stored games do not line up with its counts game for game (test 117
has 864 stored games and counted 802), so no order is claimed.
"""
import argparse
import re
import datetime
import json
import os
import subprocess
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "site")

SERVER = r'''
import json, sqlite3, sys
db = sqlite3.connect("file:/opt/openbench/db.sqlite3?mode=ro", uri=True)
cur = db.cursor()
gaunt = dict(cur.execute("select test_id, gauntlet_id from OpenBench_gauntletopponent").fetchall())
played = cur.execute("select sum(games) from OpenBench_profile").fetchone()[0] or 0
rows = cur.execute("select id, test_mode, dev_engine, base_engine, games, wins, draws, losses, passed, failed, "
                   "finished, deleted, creation from OpenBench_test order by id").fetchall()
json.dump({"played": played, "runs": [{"id": i, "mode": mode, "dev": dev, "base": base, "games": games, "w": w, "d": d, "l": l,
            "passed": passed, "failed": failed, "finished": finished, "deleted": deleted,
            "created": created[:10], "gauntlet": gaunt.get(i)}
           for (i, mode, dev, base, games, w, d, l, passed, failed, finished, deleted, created) in rows]}, sys.stdout)
'''


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--via", default="ssh oracle")
    a = ap.parse_args()
    cmd = (a.via.split() if a.via else []) + ["python3", "-"]
    got = subprocess.run(cmd, input=SERVER.encode(), capture_output=True, timeout=300)
    if got.returncode:
        sys.exit("the bench server said: " + got.stderr.decode(errors="replace")[-600:])
    got = json.loads(got.stdout)
    rows, played = got["runs"], got["played"]

    tests = json.load(open(os.path.join(ROOT, "assets", "data", "tests.json"), encoding="utf-8"))
    listed = {t["test"]: t for t in tests.get("tests", [])}
    opp = {}                                   # every gauntlet the site keeps: the newest and the one the ride draws
    for name in sorted(os.listdir(os.path.join(ROOT, "assets", "data"))):
        if name.startswith("gauntlet") and name.endswith(".json"):
            gaunt = json.load(open(os.path.join(ROOT, "assets", "data", name), encoding="utf-8"))
            opp.update({o["test"]: o["name"] for o in gaunt.get("opponents", [])})

    runs, total = [], 0
    for r in rows:
        if not r["games"]:
            continue
        assert r["w"] + r["d"] + r["l"] == r["games"], r
        total += r["games"]
        kind = {"SPRT": "s", "SPSA": "t"}.get(r["mode"], "g" if r["gauntlet"] else "m")
        state = "x" if r["deleted"] else ("p" if r["passed"] else "f" if r["failed"] else "r" if not r["finished"] else "-")
        if kind == "s":
            label = listed.get(r["id"], {}).get("title", "")
        elif kind == "t":
            label = ""
        else:
            label = opp.get(r["id"]) or (r["base"] if r["base"] != r["dev"] else "")
        row = {"id": r["id"], "k": kind, "n": r["games"], "w": r["w"], "d": r["d"], "l": r["l"], "s": state,
               "day": r["created"], "t": label}
        if r["gauntlet"]:
            row["gauntlet"] = r["gauntlet"]
        if r["id"] in listed:               # the Elo as the record quotes it, and what became of the change
            row["e"] = listed[r["id"]].get("text", "")
            row["label"] = listed[r["id"]].get("label", "")
        runs.append(row)
    # the bench's own count also holds games of runs since removed from its database: they are
    # drawn too, as one run whose results were not kept, so the cells add up to that count
    if played > total:
        runs.append({"id": 0, "k": "u", "n": played - total, "w": 0, "d": 0, "l": played - total, "s": "x", "day": "", "t": ""})
        total = played
    out = {
        "note": "Every run on the bench with its wins, draws and losses. Written by tools/wall.py.",
        "asOf": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d"),
        "games": total,
        "runs": runs,
    }
    path = os.path.join(ROOT, "assets", "data", "wall.json")
    with open(path, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(out, fh, separators=(",", ":"), ensure_ascii=False)
    kinds = {}
    for r in runs:
        kinds[r["k"]] = kinds.get(r["k"], 0) + r["n"]
    print("wrote %s: %d runs, %s games (%s)" % (os.path.relpath(path), len(runs), format(total, ","),
                                                ", ".join("%s %s" % (k, format(v, ",")) for k, v in sorted(kinds.items()))))
    # the same count wherever the pages give it: the home page's ride (its last scale and step) and the
    # totals on the home and tests pages, so the wall and every number about it come from one moment

    N = format(total, ",")
    for rel, pats in (("index.html", [(r"(data-wall-games>)[\d,]+(<)", 2), (r'(<dt>OpenBench games</dt><dd class="num[^"]*"><span data-odo>)[^<]+(</span>)', 1)]),
                      ("tests/index.html", [(r'(<dt>OpenBench games</dt><dd class="num[^"]*"><span data-odo>)[^<]+(</span>)', 1)])):
        p = os.path.join(ROOT, rel)
        text = open(p, encoding="utf-8").read()
        for pat, want in pats:
            text, n = re.subn(pat, lambda m: m.group(1) + N + m.group(2), text)
            if n != want:
                sys.exit("%s: expected %d place(s) for %s, found %d" % (rel, want, pat[:40], n))
        with open(p, "w", encoding="utf-8", newline="\n") as fh:
            fh.write(text)
    print("the pages now give %s games" % N)


if __name__ == "__main__":
    main()
