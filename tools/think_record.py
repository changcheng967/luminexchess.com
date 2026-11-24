"""Record main's engine thinking on the site's showcase positions, for think.json.

usage: python -I record.py ENGINE POSITIONS_JSON OUT_JSON [MOVETIME_MS]
Every line the engine prints is kept with the engine's own clock (the info lines' time field).
"""
import json
import subprocess
import sys
import time

engine, positions, out = sys.argv[1], sys.argv[2], sys.argv[3]
movetime = int(sys.argv[4]) if len(sys.argv) > 4 else 10000


def run(pos):
    p = subprocess.Popen([engine], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, bufsize=1)

    def send(s):
        p.stdin.write(s + "\n")
        p.stdin.flush()

    def until(word):
        got = []
        while True:
            line = p.stdout.readline()
            if not line:
                raise SystemExit("the engine stopped")
            line = line.rstrip("\n")
            got.append(line)
            if line.startswith(word):
                return got

    send("uci"); until("uciok")
    send("setoption name Threads value 1")
    send("setoption name Hash value 64")
    send("isready"); until("readyok")
    send("ucinewgame")
    send("isready"); until("readyok")
    send("position fen " + pos["start"] + (" moves " + " ".join(pos["moves"]) if pos["moves"] else ""))
    t0 = time.time()
    send("go movetime %d" % movetime)
    lines = until("bestmove")
    wall = time.time() - t0
    send("quit")
    p.wait(timeout=10)
    return lines, wall


plist = json.load(open(positions, encoding="utf-8"))
res = []
for pos in plist:
    lines, wall = run(pos)
    print(pos["label"], "-", len(lines), "lines,", "%.2f s wall" % wall, "|", lines[-1])
    res.append({"label": pos["label"], "raw": lines, "wall": wall})
json.dump({"engine": engine, "movetime": movetime, "results": res}, open(out, "w", encoding="utf-8"), indent=1)
