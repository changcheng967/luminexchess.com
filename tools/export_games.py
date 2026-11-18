"""Write the site's game data and its downloadable PGN from the games' own PGN files.

    python -X utf8 -I tools/export_games.py site/assets/data/games.json \
        site/assets/data/luminex-gauntlet-wins.pgn GAME.pgn [GAME.pgn ...]

Each SHOWCASE entry names its game by position in the combined list of the GAME.pgn
files. The move comments must start with the mover's own score and depth
("+0.82/15"), as OpenBench and fastchess write them. Captions quote each engine's own
score, the number the viewer's cards show. Needs python-chess.

The first game is also the one the home page plays as it scrolls; its start position
has to be reachable from the initial array by the moves in the home page's data-book
attribute (this script prints them for the first game).

The current games are Luminex's only wins against Obsidian v16.0 and Berserk 14 in
gauntlet 3 (tests 116 and 117 on bench.luminexchess.com, 13 and 14 November 2026):

    python -X utf8 -I tools/export_games.py site/assets/data/games.json \
        site/assets/data/luminex-gauntlet-wins.pgn luminex_win_test116.pgn luminex_win_test117.pgn

Before them the page showed two wins against Stash 37 from a 100-game match of
10 November 2026 (commit 6323ef0 and earlier have that data and its captions).
"""
import json
import os
import sys

import chess
import chess.pgn

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import select_games  # noqa: E402

# what both games share, in the words the PGN and the pages use
BUILD = "main of 13 November 2026 (a42d22ac) with the gen768r_05q network"
CLOCK = "10+0.1"          # the bench's time control; a worker scales it to its own speed

SHOWCASE = [
    {
        "id": 0,
        "opponent": "Obsidian v16.0",
        "test": 116,
        "games": 800, "wins": 1, "draws": 133, "losses": 666,
        "title": "A rook for a rook by move ten",
        "opening": "a two-move book opening (c4 and b4 against ...e5 and ...b5)",
        "story": "Luminex's only win in 800 games against Obsidian v16.0 (3746 on CCRL Blitz): "
                 "1 win, 133 draws, 666 losses. Obsidian's queen took the rook on a1, Luminex's bishop the rook on h8. "
                 "From move 6 both engines scored White ahead; mate came on move 83.",
        "moments": {
            6: "6.Nxe5: Luminex takes a pawn. Its own score goes from +0.2 to +1.5, Obsidian's from +0.2 to −1.1.",
            9: "7...Qxa1: Obsidian's queen takes the rook in the corner. Its own score is still −1.0.",
            14: "10.Bxh8: the bishop takes a rook back. Luminex +2.3, Obsidian −1.3 for itself.",
            24: "15.Rxd1: the queens are off and the material is level. Luminex scores itself +3.8, Obsidian −1.7.",
            84: "45.Nxg7: two knights and a pawn against a knight. Luminex +8.9, Obsidian −3.0.",
            146: "76.f7: Luminex announces mate in 10. Obsidian's next score is −6.6.",
            150: "78.f8=Q+: the pawn queens with check. Now Obsidian sees the mate too.",
            160: "83.Ng4#: checkmate, by a knight.",
        },
    },
    {
        "id": 1,
        "opponent": "Berserk 14",
        "test": 117,
        "games": 802, "wins": 1, "draws": 145, "losses": 656,
        "title": "Level for twenty moves, then a knight on e6",
        "opening": "a two-move book opening (b3 and c4 against ...c6 and ...e6)",
        "story": "Luminex's only win in 802 games against Berserk 14 (3737 on CCRL Blitz): "
                 "1 win, 145 draws, 656 losses. For twenty moves Berserk scored the game within 0.4 of level. "
                 "Then 21.Nxe6 gave a knight for a pawn: Luminex scored itself +4.4, and Berserk's own score "
                 "went from +0.1 to −2.2 in one move. Mate came on move 103.",
        "moments": {
            35: "20...Rfd8: twenty moves in, Berserk scores itself +0.1 and Luminex scores itself +0.5.",
            36: "21.Nxe6: Luminex gives a knight for a pawn and scores itself +4.4. Berserk's reply scores −2.2.",
            40: "23.Qxf6: the queen takes a bishop, and the pinned g-pawn cannot take back. "
                "Luminex is a pawn up: +4.4, against Berserk's −2.1.",
            60: "33.Qxc5: the queens come off. A rook ending with a pawn more: Luminex +6.1, Berserk −1.8.",
            135: "70...h1=Q: Berserk queens first, and loses its rook to 71.Rxd8.",
            142: "74.a8=Q: Luminex queens too. Luminex +13.4, Berserk −12.8.",
            152: "79.Rxd4: a rook and two pawns against a bare king. Two moves later Berserk is counting the moves "
                 "to mate; Luminex, scoring the ending with its network alone, takes twenty moves to queen a pawn. "
                 "Since 17 November main scores a bare king by rule (#92).",
            200: "103.Rd1#: checkmate.",
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
    out_json, out_pgn, paths = sys.argv[1], sys.argv[2], sys.argv[3:]
    games = select_games.load(paths)
    out = []
    for n, spec in enumerate(SHOWCASE):
        game = games[spec["id"]]
        g = select_games.export(game, spec["id"])
        lum_white = g["white"] == "Luminex"
        assert g["result"] == ("1-0" if lum_white else "0-1"), (spec["id"], g["result"])
        assert spec["wins"] + spec["draws"] + spec["losses"] == spec["games"], spec["id"]
        plies = [{"san": p["san"], "uci": p["uci"], "fen": p["fen"].split(" ")[0],
                  "cp": p["cp"], "mate": p["mate"], "depth": p["depth"], "by": p["by"][0]}
                 for p in g["plies"]]
        start_no = g["startMoveNumber"]
        white_first = " w " in g["startFen"]
        for k, text in spec["moments"].items():
            assert 0 <= k < len(plies), (spec["id"], k)
            # a caption starts with its move, written as the viewer writes it
            white = (k % 2 == 0) == white_first
            label = "%d%s%s" % (start_no + (k + (0 if white_first else 1)) // 2, "." if white else "...", plies[k]["san"])
            assert text.startswith(label + ":"), (spec["id"], k, label, text[:24])
        out.append({
            "title": spec["title"],
            "white": "Luminex" if lum_white else spec["opponent"],
            "black": spec["opponent"] if lum_white else "Luminex",
            "result": g["result"],
            "date": game.headers.get("Date"), "timeControl": CLOCK,
            "opening": spec["opening"], "story": spec["story"],
            "match": {"test": spec["test"], "href": "https://bench.luminexchess.com/test/%d/" % spec["test"],
                      "games": spec["games"], "wins": spec["wins"], "draws": spec["draws"], "losses": spec["losses"]},
            "startFen": g["startFen"].split(" ")[0], "startMove": start_no,
            "whiteFirst": white_first,
            "moments": {str(k): v for k, v in spec["moments"].items()},
            "plies": plies,
        })
        for k, text in spec["moments"].items():
            print(f"  game {spec['id']} ply {k}: {plies[k]['san']:>8}  <- {text[:60]}")
        if n == 0:
            line = book_line(g["startFen"])
            if line:
                print('  home page: data-book="%s" data-book-san="%s"'
                      % (" ".join(u for u, _ in line), " ".join(s for _, s in line)))
    with open(out_json, "w", encoding="utf-8") as fh:
        json.dump(out, fh, separators=(",", ":"), ensure_ascii=False)

    # the same games as a downloadable PGN, under the players' plain names
    with open(out_pgn, "w", encoding="utf-8", newline="\n") as fh:
        for spec in SHOWCASE:
            g = games[spec["id"]]
            h = g.headers
            lum_white = h["White"].startswith("Luminex")
            worker_clock = h.get("TimeControl")
            h["Event"] = "Luminex gauntlet 3, test %d: %d games against %s" % (spec["test"], spec["games"], spec["opponent"])
            h["Site"] = "https://bench.luminexchess.com/test/%d/" % spec["test"]
            h["White"] = "Luminex" if lum_white else spec["opponent"]
            h["Black"] = spec["opponent"] if lum_white else "Luminex"
            for key in ("ScaleFactor", "GameDuration", "GameStartTime", "GameEndTime", "EngineWhiteAuthor", "EngineBlackAuthor"):
                h.pop(key, None)
            g.comment = (f"{spec['title']}. Luminex ({BUILD}) against {spec['opponent']}, one thread, "
                         f"the bench's {CLOCK} scaled to the worker's speed ({worker_clock}). "
                         f"Luminex's only win of the {spec['games']} games of test {spec['test']}: "
                         f"{spec['wins']} win, {spec['draws']} draws, {spec['losses']} losses. "
                         "Each move's comment is the moving engine's own score, from its side's point of view, "
                         "and its search depth.")
            print(g, file=fh, end="\n\n")
    print(f"wrote {len(SHOWCASE)} games to {out_json} and {out_pgn}")


if __name__ == "__main__":
    main()
