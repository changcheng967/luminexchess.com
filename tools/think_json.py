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

# Each story is checked by hand against the recording it describes (raw.json): depths, nodes and scores as the engine printed them.
STORY = {
    "28...Bh5": ("28...Bh5 v PlentyChess b-v8.0.0",
                 "The bishop to h5 leads from depth 7 to 9, then gives way to ...a4, scored +1.1 to +1.7. At depth 17, after "
                 "615,662 nodes, it comes back and the score jumps from +1.51 to +4.24; it holds to depth 31. In the game "
                 "against PlentyChess b-v8.0.0 it played the same move, at +4.53."),
    "31...Rxe4": ("31...Rxe4 v PlentyChess b-v8.0.0",
                  "From depth 2 to 9 the queen goes to f6 or e6, scored +0.23 to +1.17. At depth 10, after 31,171 nodes, the "
                  "engine sees the rook for the bishop on e4, and its score jumps from +0.92 to +4.17; the move holds to depth 33. "
                  "In the game it gave the rook the same way."),
    "47...Qxh3+": ("47...Qxh3+ v Obsidian v16.0",
                   "The queen takes on h3 from the first iteration, scored level through depth 3. At depth 4, after 309 nodes, "
                   "the engine sees mate in three, and every iteration after it says the same, to depth 87. In the game, "
                   "Obsidian v16.0 had just scored itself +2.4, and Luminex played the same move."),
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
    bm = [l for l in res["raw"] if l.startswith("bestmove")][0].split()
    best, ponder = bm[1], (bm[3] if len(bm) > 3 and bm[2] == "ponder" else None)
    g = G[pos["game"]]
    tab, story = STORY[pos["label"]]
    searches.append({
        "tab": tab,
        "title": "%s v %s, after %s: %s to move" % (g["white"], g["black"], move_label(g, pos["ply"]),
                                                    "White" if board.turn == chess.WHITE else "Black"),
        "story": story,
        "fen": board.fen(),
        "last": pos["last"],
        "movetime": R["movetime"],
        "end": int(round(res["wall"] * 1000)),
        "note": note,
        "lines": lines,
        "bestmove": best,
        "bestSan": board.san(chess.Move.from_uci(best)),
        # what was sent and what came back, as the engine's own lines: the download page replays the session
        "position": "position fen " + pos["start"] + (" moves " + " ".join(pos["moves"]) if pos["moves"] else ""),
        "ponder": ponder,
    })
    print(tab, "|", len(lines), "lines | best", searches[-1]["bestSan"], "| end", lines[-1]["time"], "ms |", searches[-1]["title"])

json.dump({"engine": "Luminex 6.7.0",
           "about": "v6.7.0's release build for Linux, with gen768u_01q inside; one thread of an Intel Xeon Platinum 8269CY, "
                    "Hash 64 MB, go movetime 10000",
           "searches": searches}, open(out, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
