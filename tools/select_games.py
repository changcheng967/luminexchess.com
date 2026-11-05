"""Rank Luminex wins in OpenBench PGNs, for picking the homepage's showcase games.

    python -X utf8 -I tools/select_games.py candidates.json GAME.pgn [GAME.pgn ...]

Prints the balanced-start Luminex wins in which Luminex's own score saw the win
coming earliest, compared with Stash's, and writes the top twelve to
candidates.json: per ply the SAN, the FEN after the move, and the mover's score
and depth, converted to White's point of view. Needs python-chess.

The current showcase games come from the PGN archive of OpenBench test 20
(https://bench.luminexchess.com/test/20/), files 20.35.1041.pgn and
20.36.1241.pgn, given in that order.
"""
import json
import re
import sys

import chess
import chess.pgn

EVAL_RE = re.compile(r"^([+-]?)(M?)(\d+(?:\.\d+)?)/(\d+)")


def parse_eval(comment):
    """'+0.65/15' -> (65, None, 15); '+M13/24' -> (None, 13, 24); signs are the mover's view."""
    m = EVAL_RE.match(comment.strip())
    if not m:
        return None
    sign = -1 if m.group(1) == "-" else 1
    depth = int(m.group(4))
    if m.group(2):
        return None, sign * int(float(m.group(3))), depth
    return round(sign * float(m.group(3)) * 100), None, depth


def load(paths):
    games = []
    for path in paths:
        with open(path, encoding="utf-8", errors="replace") as fh:
            while True:
                g = chess.pgn.read_game(fh)
                if g is None:
                    break
                games.append(g)
    return games


def export(game, gid):
    h = game.headers
    lum_white = h["White"].startswith("Luminex")
    board = game.board()
    start_fen = board.fen()
    plies = []
    node = game
    while node.variations:
        nxt = node.variation(0)
        mover_white = board.turn == chess.WHITE
        san = board.san(nxt.move)
        board.push(nxt.move)
        ev = parse_eval(nxt.comment or "")
        cp = mate = depth = None
        if ev:
            cp, mate, depth = ev
            if not mover_white:             # store White's point of view
                cp = -cp if cp is not None else None
                mate = -mate if mate is not None else None
        plies.append({"san": san, "uci": nxt.move.uci(), "fen": board.fen(), "cp": cp, "mate": mate,
                      "depth": depth, "by": "luminex" if mover_white == lum_white else "stash"})
        node = nxt
    return {
        "id": gid,
        "white": "Luminex" if lum_white else "Stash 29",
        "black": "Stash 29" if lum_white else "Luminex",
        "result": h.get("Result"),
        "date": h.get("Date"),
        "timeControl": h.get("TimeControl"),
        "startFen": start_fen,
        "startMoveNumber": chess.Board(start_fen).fullmove_number,
        "checkmate": board.is_checkmate(),
        "plies": plies,
    }


def white_pov_score(p):
    if p["mate"] is not None:
        return 10000 if p["mate"] > 0 else -10000
    return p["cp"] if p["cp"] is not None else 0


def main():
    out, paths = sys.argv[1], sys.argv[2:]
    games = load(paths)
    wins = []
    for i, g in enumerate(games):
        h = g.headers
        lw = h["White"].startswith("Luminex")
        if h.get("Result") != ("1-0" if lw else "0-1"):
            continue
        e = export(g, i)
        sgn = 1 if lw else -1                  # Luminex's point of view
        lum = [(k, sgn * white_pov_score(p)) for k, p in enumerate(e["plies"])
               if p["by"] == "luminex" and (p["cp"] is not None or p["mate"] is not None)]
        st = [(k, sgn * white_pov_score(p)) for k, p in enumerate(e["plies"])
              if p["by"] == "stash" and (p["cp"] is not None or p["mate"] is not None)]
        if len(lum) < 15:
            continue
        early = [v for k, v in lum if k < 16]
        if not early or max(abs(v) for v in early) > 80:   # a balanced opening, not a gift
            continue
        lum_sees = next((k for k, v in lum if v >= 200), None)
        stash_sees = next((k for k, v in st if v >= 200), None)   # Stash's eval of Luminex's side
        if lum_sees is None or stash_sees is None:
            continue
        lead = stash_sees - lum_sees
        stash_hope = max((-v for k, v in st if k < lum_sees), default=0)   # Stash's best view of itself
        wins.append((lead, stash_hope, e))
    wins.sort(key=lambda t: (t[2]["checkmate"], t[0], t[1]), reverse=True)
    print(f"{len(games)} games, {len(wins)} balanced-start Luminex wins with eval trails")
    for lead, hope, e in wins[:15]:
        print(f"  game {e['id']:4d} {e['white']:>8} vs {e['black']:<8} plies {len(e['plies']):3d} "
              f"lead {lead:3d} plies, Stash's best self-eval before {hope:+5d} cp, mate={e['checkmate']}")
    with open(out, "w", encoding="utf-8") as fh:
        json.dump([e for _, _, e in wins[:12]], fh)


if __name__ == "__main__":
    main()
