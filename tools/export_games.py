"""Write the site's game data from candidates.json (made by select_games.py).

    python -X utf8 -I tools/export_games.py candidates.json site/assets/data/games.json \
        site/assets/data/luminex-vs-stash37.pgn GAME.pgn [GAME.pgn ...]

The GAME.pgn files must be the ones given to select_games.py, in the same
order: game ids are positions in that combined list. Captions quote each
engine's own score, the number the viewer's cards show. Needs python-chess.

The first game is also the one the home page plays as it scrolls; its start
position has to be reachable from the initial array by the moves in the home
page's data-book attribute (this script prints them for the first game).
"""
import json
import sys

import chess
import chess.pgn

# the match the games come from, in the words the PGN and the pages use
MATCH = {
    "event": "Luminex development build vs Stash 37, 100 games at 10+0.1",
    "site": "https://luminexchess.com/games/",
    "date": "2026.11.10",          # the box that played them runs on UTC+8 and stamped the 11th
    "what": "Luminex (main of 10 November 2026, with the gen768r_03 network) against Stash 37, "
            "10+0.1 on one thread",
}

SHOWCASE = [
    {
        "id": 57,
        "title": "One move from level to lost",
        "opening": "a two-move book opening (d3 and Bf4 against ...Nf6 and ...b6)",
        "story": "After 19.Ng5 Luminex rated its position +3.2 while Stash 37 scored itself only −1.0. "
                 "Five moves later Stash took a rook and scored itself −0.7; after 25.Qh6 its score was −16.5, "
                 "and it was mated on move 38.",
        "moments": {
            32: "19.Ng5: Luminex's own score jumps from +0.7 to +3.2. Stash's reply scores −1.0 for itself.",
            40: "23.Bxf6: Luminex +5.0. After its reply Stash scores itself −2.3.",
            43: "24...Rxc1: Stash takes a rook and scores itself only −0.7.",
            44: "25.Qh6: Luminex +9.1. Stash's next score is −16.5.",
            47: "26...Qh3+: Stash gives its queen away; its own score is −17.8.",
            60: "33.Qe8+: Luminex sees the mate.",
            70: "38.Qf4#: checkmate.",
        },
    },
    {
        "id": 33,
        "title": "Both engines at plus three",
        "opening": "a two-move book opening (h4 and Nh3 against ...Nc6 and ...Na5)",
        "story": "For six moves both engines agreed that Stash 37 was better. Then Luminex gave a rook for a bishop: "
                 "Stash rated itself +3.5, Luminex rated itself +3.3, and three moves later Stash's score was −6.8.",
        "moments": {
            33: "19...Bf5: both engines say Stash is better. Luminex scores itself −1.8, Stash +1.8.",
            41: "23...Nxe4: Luminex's own score turns positive, +0.8. Stash still says +1.7 for itself.",
            43: "24...Rxb2: Luminex gives a rook for a bishop and scores itself +3.3.",
            44: "25.Qxb2: Stash takes the rook and scores itself +3.5. Both engines think they are winning.",
            48: "27.Rf1: Stash's own score has dropped to −1.5, and on the next move to −6.8.",
            53: "29...Bxa1: Luminex takes the queen.",
            133: "69...h1=Q: a second queen.",
            137: "71...Qbh8#: checkmate.",
        },
    },
]


def book_line(start_fen):
    """A sequence of plies from the initial array to a book position (any legal order reaches it)."""
    want = chess.Board(start_fen)
    depth = (want.fullmove_number - 1) * 2 + (0 if want.turn == chess.WHITE else 1)
    if depth > 4:
        return None

    def search(board, line):
        if len(line) == depth:
            return line if board.board_fen() == want.board_fen() else None
        for move in board.legal_moves:
            san = board.san(move)
            board.push(move)
            found = search(board, line + [(move.uci(), san)])
            board.pop()
            if found:
                return found
        return None

    return search(chess.Board(), [])


def main():
    cands = {g["id"]: g for g in json.load(open(sys.argv[1], encoding="utf-8"))}
    out = []
    for n, spec in enumerate(SHOWCASE):
        g = cands[spec["id"]]
        plies = [{"san": p["san"], "uci": p["uci"], "fen": p["fen"].split(" ")[0],
                  "cp": p["cp"], "mate": p["mate"], "depth": p["depth"], "by": p["by"][0]}
                 for p in g["plies"]]
        for k in spec["moments"]:
            assert 0 <= k < len(plies), (spec["id"], k)
        out.append({
            "title": spec["title"],
            "white": g["white"], "black": g["black"], "result": g["result"],
            "date": MATCH["date"], "timeControl": g["timeControl"],
            "opening": spec["opening"], "story": spec["story"],
            "startFen": g["startFen"].split(" ")[0], "startMove": g["startMoveNumber"],
            "whiteFirst": " w " in g["startFen"],
            "moments": {str(k): v for k, v in spec["moments"].items()},
            "plies": plies,
        })
        # print the SAN at each moment so the captions can be checked by eye
        for k, text in spec["moments"].items():
            print(f"  game {spec['id']} ply {k}: {plies[k]['san']:>7}  <- {text[:48]}")
        if n == 0:
            line = book_line(g["startFen"])
            if line:
                print('  home page: data-book="%s" data-book-san="%s"'
                      % (" ".join(u for u, _ in line), " ".join(s for _, s in line)))
    with open(sys.argv[2], "w", encoding="utf-8") as fh:
        json.dump(out, fh, separators=(",", ":"), ensure_ascii=False)

    # the same games as a downloadable PGN, under the players' plain names
    games = []
    for path in sys.argv[4:]:
        with open(path, encoding="utf-8", errors="replace") as fh:
            while True:
                g = chess.pgn.read_game(fh)
                if g is None:
                    break
                games.append(g)
    with open(sys.argv[3], "w", encoding="utf-8", newline="\n") as fh:
        for spec in SHOWCASE:
            g = games[spec["id"]]
            ucis = [m.uci() for m in g.mainline_moves()]
            assert ucis == [p["uci"] for p in cands[spec["id"]]["plies"]], spec["id"]
            h = g.headers
            h["Event"] = MATCH["event"]
            h["Site"] = MATCH["site"]
            h["Date"] = MATCH["date"]
            for key in ("ScaleFactor", "GameDuration", "GameStartTime", "GameEndTime", "EngineWhiteAuthor", "EngineBlackAuthor"):
                h.pop(key, None)
            g.comment = (f"{spec['title']}. {MATCH['what']}. Each move's comment is the "
                         "moving engine's own score, from its side's point of view, its "
                         "search depth and the time it used.")
            print(g, file=fh, end="\n\n")
    print(f"wrote {len(SHOWCASE)} games to {sys.argv[3]}")


if __name__ == "__main__":
    main()
