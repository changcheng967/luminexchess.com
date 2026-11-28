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

The current games are two of v6.7.0's wins in gauntlet 8 (27 November 2026), against
its two highest rated opponents: Obsidian v16.0 (test 323, game 745 of the bench's
PGN archive 323.946.321, the 105th of that file) and PlentyChess b-v8.0.0 (test 322,
the 68th game of 322.942.1). The archives are /opt/openbench/Media/PGNs/<test>.pgn.tar
on the bench server; their last few games can be ones the bench did not count, so both
are taken from the counted part. Each game was cut out into its own file:

    python -X utf8 -I tools/export_games.py site/assets/data/games.json \
        site/assets/data/luminex-gauntlet-wins.pgn luminex_win_test323.pgn luminex_win_test322.pgn

Before them the page showed Luminex's only wins against Obsidian v16.0 and Berserk 14 in
gauntlet 3 (tests 116 and 117; commit ebe5588 and earlier have that data and its
captions), and before those two wins against Stash 37 (commit 6323ef0 and earlier).
"""
import json
import os
import sys

import chess
import chess.pgn

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import select_games  # noqa: E402

# what both games share, in the words the PGN and the pages use
BUILD = "v6.7.0's search and network: main of 27 November 2026 at a81c73d with gen768u_01q"
CLOCK = "10+0.1"          # the bench's time control; a worker scales it to its own speed
GAUNTLET = 8

SHOWCASE = [
    {
        "id": 0,
        "opponent": "Obsidian v16.0",
        "test": 323,
        "games": 816, "wins": 22, "draws": 439, "losses": 355,
        "title": "A queen on h3, and mate in three",
        "opening": "a two-move book opening (d4 and h3 against ...Nf6 and ...h6)",
        "story": "One of Luminex's 22 wins in 816 games against Obsidian v16.0 (3746 on CCRL Blitz): "
                 "22 wins, 439 draws, 355 losses. For thirty moves both engines scored the game within 0.9 of level. "
                 "From move 33 Luminex scored itself ahead, up to +4.0, while Obsidian scored itself at worst −1.4. "
                 "Then 47.Qxe6 took a pawn and Obsidian scored itself +2.4; Luminex gave its queen on h3 and "
                 "announced mate in three. It came on move 49.",
        "moments": {
            50: "28.Nxf7: Obsidian gives a knight for the pawn on f7 and scores itself −0.2. "
                "Luminex takes, and scores itself +0.6.",
            61: "33...Bxc5: the material is level again. Luminex scores itself +1.1, Obsidian −0.4.",
            63: "34...gxf6: a pawn more. Luminex +1.4, Obsidian −0.5.",
            69: "37...Rc4: Luminex +2.1. Obsidian still scores itself −0.4.",
            83: "44...Rc4: Luminex scores itself +4.0. Obsidian's reply scores −1.2.",
            88: "47.Qxe6: Obsidian's queen takes the pawn back, and Obsidian scores itself +2.4.",
            89: "47...Qxh3+: Luminex gives its queen and announces mate in three.",
            90: "48.gxh3: Obsidian takes the queen, and sees the mate.",
            93: "49...R8g2#: checkmate, by the two rooks.",
        },
    },
    {
        "id": 1,
        "opponent": "PlentyChess b-v8.0.0",
        "test": 322,
        "games": 808, "wins": 10, "draws": 416, "losses": 382,
        "title": "A rook on e4, then a queen against a rook",
        "opening": "a two-move book opening (Nc3 and f3 against ...e6 and ...Bc5)",
        "story": "One of Luminex's 10 wins in 808 games against PlentyChess b-v8.0.0, the highest rated engine of "
                 "the gauntlet (3773 on CCRL Blitz): 10 wins, 416 draws, 382 losses. From move 16 Luminex scored itself "
                 "about a pawn ahead; at 28...Bh5 its score jumped to +4.5, while PlentyChess scored itself −1.0. "
                 "Luminex gave a rook for the bishop on e4, took a rook back on g2, and gave its last rook to queen "
                 "the f-pawn on move 65. PlentyChess saw the mate on move 108; it came on move 121.",
        "moments": {
            27: "16...Bg6: Luminex scores itself +1.1. PlentyChess scores itself −0.2.",
            51: "28...Bh5: Luminex's score jumps from +1.7 to +4.5. PlentyChess's reply scores −1.8 for itself.",
            57: "31...Rxe4: Luminex gives a rook for the bishop on e4 and scores itself +3.7. "
                "PlentyChess takes back, at −1.9.",
            65: "35...Bxg2+: the bishop takes a rook on g2; after 36.Qxg2 the material is level again. "
                "Luminex +4.6, PlentyChess −1.9.",
            75: "40...cxd5: the queens are off: a rook ending with a pawn more. Luminex +5.8, PlentyChess −1.9.",
            125: "65...f1=Q: Luminex let its rook go to queen the pawn: a queen against a rook. "
                 "Luminex +11.6, PlentyChess −4.1.",
            209: "107...Qe7+: Luminex scores the ending a known win. PlentyChess's reply sees mate in 22.",
            223: "114...Kxb7: the king takes the rook. Mate in 10.",
            237: "121...Qe7#: checkmate.",
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
            h["Event"] = "Luminex gauntlet %d, test %d: %d games against %s" % (GAUNTLET, spec["test"], spec["games"], spec["opponent"])
            h["Site"] = "https://bench.luminexchess.com/test/%d/" % spec["test"]
            h["White"] = "Luminex" if lum_white else spec["opponent"]
            h["Black"] = spec["opponent"] if lum_white else "Luminex"
            for key in ("ScaleFactor", "GameDuration", "GameStartTime", "GameEndTime", "EngineWhiteAuthor", "EngineBlackAuthor"):
                h.pop(key, None)
            g.comment = (f"{spec['title']}. Luminex ({BUILD}) against {spec['opponent']}, one thread, "
                         f"the bench's {CLOCK} scaled to the worker's speed ({worker_clock}). "
                         f"One of Luminex's {spec['wins']} wins in the {spec['games']} games of test {spec['test']}: "
                         f"{spec['wins']} wins, {spec['draws']} draws, {spec['losses']} losses. "
                         "Each move's comment is the moving engine's own score, from its side's point of view, "
                         "and its search depth.")
            print(g, file=fh, end="\n\n")
    print(f"wrote {len(SHOWCASE)} games to {out_json} and {out_pgn}")


if __name__ == "__main__":
    main()
