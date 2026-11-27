"""Take the copy of Luminex's Lichess account that the home page carries.

    python -I tools/lichess.py            read Lichess, write site/assets/data/lichess.json
    python -I tools/lichess.py --check    read Lichess and say what differs from lichess.json

The bot account luminexbot plays on Lichess (https://lichess.org/@/luminexbot). The home page's
card "In public, on Lichess" reads the account from Lichess's public API while a visitor looks at
it (assets/js/lichess.js). This file is the copy the card stands on before that, without scripts,
or when Lichess does not answer:

    - the ratings Lichess gives it at each time control it has played, each with its history;
    - every game it has played against another account, oldest first, as Lichess counts them on
      its profile (games against Lichess's own computer are left out, as the profile leaves them);
    - the last game's final position and how it ended.

Then run tools/stamp.py site, which writes the card's still form from it.

Lichess asks API clients to make one request at a time and to wait a full minute after a 429;
this tool does both. The game export streams about 20 games a second to a client without a token,
so a few hundred games take a few seconds.
"""
import argparse
import datetime
import json
import os
import sys
import time
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "site", "assets", "data", "lichess.json")
API = "https://lichess.org"
BOT = "luminexbot"
AGENT = "site-build"
PERFS = (("bullet", "Bullet"), ("blitz", "Blitz"), ("rapid", "Rapid"), ("classical", "Classical"))
SPEED = {"ultraBullet": "u", "bullet": "b", "blitz": "z", "rapid": "r", "classical": "c", "correspondence": "o"}
MONTHS = ("January", "February", "March", "April", "May", "June", "July", "August", "September",
          "October", "November", "December")


def get(path, accept="application/json"):
    """One request, waiting out a 429 as Lichess asks."""
    for attempt in range(3):
        req = urllib.request.Request(API + path, headers={"Accept": accept, "User-Agent": AGENT})
        try:
            with urllib.request.urlopen(req, timeout=120) as res:
                return res.read().decode("utf-8")
        except urllib.error.HTTPError as e:
            if e.code != 429 or attempt == 2:
                raise
            print("Lichess asked to slow down (429): waiting a minute", file=sys.stderr)
            time.sleep(61)
    raise RuntimeError("unreachable")


def clock_text(initial, inc):
    """Lichess's own way to write a clock: 1+1, 3+2, ½+0."""
    m = initial / 60
    frac = {0.25: "¼", 0.5: "½", 0.75: "¾"}
    base = str(int(m)) if m == int(m) else frac.get(m, ("%.1f" % m).rstrip("0").rstrip("."))
    return "%s+%d" % (base, inc)


def long_date(d):
    return "%d %s %d" % (d.day, MONTHS[d.month - 1], d.year)


def utc(ms):
    return datetime.datetime.fromtimestamp(ms / 1000, datetime.timezone.utc)


def side(game):
    w = (game["players"]["white"].get("user") or {}).get("id")
    return "w" if w == BOT else "b"


def player(p):
    u = p.get("user") or {}
    return {"name": u.get("name") or ("Stockfish level %s" % p.get("aiLevel")), "title": u.get("title") or "",
            "rating": p.get("rating"), "diff": p.get("ratingDiff")}


def read():
    user = json.loads(get("/api/user/" + BOT))
    hist = json.loads(get("/api/user/%s/rating-history" % BOT))
    raw = get("/api/games/user/%s?moves=false&opening=true&lastFen=true&clocks=false&evals=false" % BOT,
              accept="application/x-ndjson")
    games = [json.loads(line) for line in raw.splitlines() if line.strip()]
    return user, hist, games


def build(user, hist, games):
    now = datetime.datetime.now(datetime.timezone.utc)
    history = {h["name"].lower(): h["points"] for h in hist}
    perfs = []
    for key, name in PERFS:
        p = (user.get("perfs") or {}).get(key) or {}
        if not p.get("games"):
            continue
        points = [["%04d-%02d-%02d" % (y, m + 1, d), r] for y, m, d, r in history.get(key, [])]
        perfs.append({"key": key, "name": name, "rating": p["rating"], "rd": p.get("rd"), "prog": p.get("prog", 0),
                      "games": p["games"], "prov": bool(p.get("prov")), "history": points,
                      "href": "%s/@/%s/perf/%s" % (API, BOT, key)})

    # the games Lichess's profile counts: against other accounts, not against its own computer
    played = [g for g in games if g.get("source") != "ai" and g.get("status") not in ("created", "started")]
    played.sort(key=lambda g: g["createdAt"])
    rows = []
    for g in played:
        me = side(g)
        us = g["players"]["white" if me == "w" else "black"]
        them = player(g["players"]["black" if me == "w" else "white"])
        won = g.get("winner")
        result = "D" if not won else ("W" if won[0] == me else "L")
        clock = g.get("clock") or {}
        rows.append([g["id"], g["createdAt"] // 1000, SPEED.get(g["speed"], "?"),
                     clock_text(clock.get("initial", 0), clock.get("increment", 0)) if clock else "",
                     me, result, 1 if g.get("rated") else 0, them["name"], them["title"], them["rating"],
                     us.get("rating"), us.get("ratingDiff"), g.get("status", ""), (g.get("opening") or {}).get("name", "")])

    count = user.get("count") or {}
    counted = {"all": len(rows), "win": sum(r[5] == "W" for r in rows), "draw": sum(r[5] == "D" for r in rows),
               "loss": sum(r[5] == "L" for r in rows)}
    profile = {k: count.get(k) for k in ("all", "win", "draw", "loss")}
    if counted != profile:
        raise SystemExit("the game list (%s) and the profile's counts (%s) differ: a game ended between the two "
                         "reads; run again" % (counted, profile))

    last = played[-1] if played else None
    out = {
        "note": "Luminex's Lichess account as the home page's card shows it before it reads Lichess live "
                "(assets/js/lichess.js). Written by tools/lichess.py; run tools/stamp.py site afterwards.",
        "href": "%s/@/%s" % (API, BOT),
        "name": user.get("username", BOT),
        "read": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "readText": "%s, %s UTC" % (long_date(now), now.strftime("%H:%M")),
        "created": utc(user["createdAt"]).strftime("%Y-%m-%d"),
        "perfs": perfs,
        "count": counted,
        "since": max(g["createdAt"] for g in played) if played else 0,
        "games": rows,
        "fields": ["id", "created", "speed", "clock", "side", "result", "rated", "opponent", "title",
                   "opponentRating", "rating", "ratingDiff", "status", "opening"],
        "last": None,
    }
    if last:
        clock = last.get("clock") or {}
        out["last"] = {
            "id": last["id"], "fen": last.get("lastFen", ""), "lm": last.get("lastMove", ""),
            "status": last.get("status", ""), "winner": last.get("winner", ""),
            "speed": last["speed"], "clock": clock_text(clock.get("initial", 0), clock.get("increment", 0)) if clock else "",
            "rated": bool(last.get("rated")), "side": side(last),
            "white": player(last["players"]["white"]), "black": player(last["players"]["black"]),
            "end": (last.get("lastMoveAt") or last["createdAt"]) // 1000,
            "opening": (last.get("opening") or {}).get("name", ""),
        }
    return out


def summary(d):
    perfs = ", ".join("%s %d (%d games)" % (p["name"], p["rating"], p["games"]) for p in d["perfs"])
    c = d["count"]
    return "%s: %s; %d games: %d wins, %d draws, %d losses; read %s" % (
        d["name"], perfs, c["all"], c["win"], c["draw"], c["loss"], d["readText"])


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--check", action="store_true", help="read Lichess and compare with lichess.json; write nothing")
    a = ap.parse_args()
    d = build(*read())
    print(summary(d))
    if a.check:
        if not os.path.exists(OUT):
            print("lichess.json does not exist yet")
            return
        with open(OUT, encoding="utf-8") as fh:
            old = json.load(fh)
        print("lichess.json:", summary(old))
        print("%d games since that copy" % (len(d["games"]) - len(old["games"])))
        return
    # one line a game, so a new copy reads as the games it adds
    head = json.dumps({k: v for k, v in d.items() if k != "games"}, ensure_ascii=False, indent=1)
    rows = ",\n".join("  " + json.dumps(r, ensure_ascii=False, separators=(",", ":")) for r in d["games"])
    with open(OUT, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(head[:-2] + ',\n "games": [\n' + rows + "\n ]\n}\n")
    print("written to site/assets/data/lichess.json (%d bytes). Now run: python -I tools/stamp.py site"
          % os.path.getsize(OUT))


if __name__ == "__main__":
    main()
