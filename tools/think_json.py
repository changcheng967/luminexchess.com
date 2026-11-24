"""Turn record.py's raw lines into the site's think.json.

usage: python -I make_think.py POSITIONS_JSON RAW_JSON GAMES_JSON OUT_JSON
Each info line keeps the engine's numbers; its time is nodes / nps (the lines carry no time field), which
puts the last line at the search's own end. The line of play is turned into moves as a reader writes them.
"""
import json
import sys

import chess

positions, raw, games_path, out = sys.argv[1:5]
P = json.load(open(positions, encoding="utf-8"))
R = json.load(open(raw, encoding="utf-8"))
G = json.load(open(games_path, encoding="utf-8"))

STORY = {
    "21.Nxe6": ("21.Nxe6 v Berserk 14",
                "Through depth 7 the engine plays a quiet move and scores itself a little worse. At depth 8, after 18,039 nodes, "
                "it finds the knight for a pawn, 21.Nxe6, and its score jumps from −0.50 to +3.77; the move holds for every iteration "
                "after it, to depth 34. In the game against Berserk 14 it played the same move."),
    "6.Nxe5": ("6.Nxe5 v Obsidian v16.0",
               "Through depth 7 the engine develops the bishop. At depth 8 it sees 6.Nxe5, the pawn the game took, at +3.10; it changes "
               "its mind once, at depth 23, and comes back to the knight at depth 24."),
    "76.f7": ("76.f7 v Obsidian v16.0",
              "The pawn goes first from depth 1. From depth 9 the line queens it, and the engine scores the ending a known win, an "
              "ending it settles by its material. At depth 22 it finds mate in 16, and at depth 25 mate in 15."),
}


def san_line(board, pv):
    b, out = board.copy(), []
    for u in pv:
        m = chess.Move.from_uci(u)
        if m not in b.legal_moves:
            break
        out.append(b.san(m))
        b.push(m)
    return out


def move_label(g, ply):
    k = ply - 1                                   # the ply just played, as the site numbers moves
    white = k % 2 == 0 if g["whiteFirst"] else k % 2 == 1
    n = g["startMove"] + (k + (0 if g["whiteFirst"] else 1)) // 2
    return "%d%s%s" % (n, "." if white else "...", g["plies"][k]["san"])


searches = []
for pos, res in zip(P, R["results"]):
    assert pos["label"] == res["label"]
    board = chess.Board(pos["start"])
    for u in pos["moves"]:
        board.push_uci(u)
    lines, note = [], ""
    for l in res["raw"]:
        if l.startswith("info string"):
            note = note or l
            continue
        if not l.startswith("info ") or " pv " not in l or " depth " not in " " + l:
            continue
        t = l.split()
        f = {}
        i = 1
        while i < len(t):
            k = t[i]
            if k == "pv":
                f["pv"] = t[i + 1:]
                break
            if k == "score":
                f[t[i + 1]] = int(t[i + 2])
                i += 3
                if i < len(t) and t[i] in ("lowerbound", "upperbound"):
                    f["bound"] = t[i]
                    i += 1
                continue
            if k in ("depth", "seldepth", "nodes", "nps", "time", "hashfull", "multipv", "tbhits"):
                f[k] = int(t[i + 1])
                i += 2
                continue
            i += 1
        line = {"depth": f["depth"], "nodes": f["nodes"], "nps": f["nps"], "pv": f["pv"]}
        line["time"] = f.get("time", int(round(1000.0 * f["nodes"] / max(1, f["nps"]))))
        if "mate" in f:
            line["mate"] = f["mate"]
        else:
            line["cp"] = f["cp"]
        if "seldepth" in f:
            line["seldepth"] = f["seldepth"]
        line["san"] = san_line(board, f["pv"])
        lines.append(line)
    best = [l for l in res["raw"] if l.startswith("bestmove")][0].split()[1]
    g = G[pos["game"]]
    tab, story = STORY[pos["label"]]
    searches.append({
        "tab": tab,
        "title": "%s v %s, after %s: White to move" % (g["white"], g["black"], move_label(g, pos["ply"])),
        "story": story,
        "fen": board.fen(),
        "last": pos["last"],
        "movetime": R["movetime"],
        "end": int(round(res["wall"] * 1000)),
        "note": note,
        "lines": lines,
        "bestmove": best,
        "bestSan": board.san(chess.Move.from_uci(best)),
    })
    print(tab, "|", len(lines), "lines | best", searches[-1]["bestSan"], "| end", lines[-1]["time"], "ms |", searches[-1]["title"])

json.dump({"engine": "Luminex dev-20261124-100de92c",
           "about": "main's development build of 24 November 2026 (100de92), with gen768t_05q inside; one thread of an Intel Core Ultra 9 275HX, "
                    "Hash 64 MB, go movetime 10000",
           "searches": searches}, open(out, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
