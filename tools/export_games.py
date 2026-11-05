"""Write the homepage's game data from candidates.json (made by select_games.py).

    python -X utf8 -I tools/export_games.py candidates.json site/assets/data/games.json \
        site/assets/data/luminex-vs-stash29.pgn GAME.pgn [GAME.pgn ...]

The GAME.pgn files must be the ones given to select_games.py, in the same
order: game ids are positions in that combined list. Captions quote each
engine's own score, the number the viewer's cards show. Needs python-chess.
"""
import json
import sys

import chess.pgn

SHOWCASE = [
    {
        "id": 159,
        "title": "The queenside squeeze",
        "opening": "a random two-move opening, 1.h3 e6 2.Rh2 Qf6",
        "story": "Luminex rated its position winning from move 15, five moves before Stash 29 agreed, "
                 "then turned its queenside pawns into two new queens.",
        "moments": {
            24: "15.Qb3: Luminex already scores this +1.8 for itself. Stash's reply still calls the game level.",
            35: "20...Qxg2: only now does Stash's own score turn, to −1.9 for itself.",
            60: "33.b5+: the pawns start rolling. Luminex +3.0.",
            74: "40.b8=Q: the first new queen.",
            82: "44.a8=Q: and the second.",
            92: "49.Rd8#: checkmate.",
        },
    },
    {
        "id": 280,
        "title": "The attack Stash missed",
        "opening": "a random two-move opening (c3 and d3 against ...d5 and ...Na6)",
        "story": "A knight up, Stash 29 rated its position +7.0. Luminex kept a pawn on f3 and a rook "
                 "on the h-file, found 41...Qe6, and mated five moves later.",
        "moments": {
            67: "36...Ne1+: Luminex gives up a knight; its own score is −0.6.",
            68: "37.Rfxe1: Stash takes it and scores itself +5.5.",
            76: "41.b5: Stash +7.0. Luminex's pawn on f3 and rook on h3 are still there.",
            77: "41...Qe6: Luminex now scores +2.8 for itself.",
            78: "42.Qxe5+: Stash's search finds the truth: −15.8 for itself.",
            87: "46...Qg2#: checkmate.",
        },
    },
]


def main():
    cands = {g["id"]: g for g in json.load(open(sys.argv[1], encoding="utf-8"))}
    out = []
    for spec in SHOWCASE:
        g = cands[spec["id"]]
        plies = [{"san": p["san"], "uci": p["uci"], "fen": p["fen"].split(" ")[0],
                  "cp": p["cp"], "mate": p["mate"], "depth": p["depth"], "by": p["by"][0]}
                 for p in g["plies"]]
        for k in spec["moments"]:
            assert 0 <= k < len(plies), (spec["id"], k)
        out.append({
            "title": spec["title"],
            "white": g["white"], "black": g["black"], "result": g["result"],
            "date": g["date"], "timeControl": g["timeControl"],
            "opening": spec["opening"], "story": spec["story"],
            "startFen": g["startFen"].split(" ")[0], "startMove": g["startMoveNumber"],
            "whiteFirst": " w " in g["startFen"],
            "moments": {str(k): v for k, v in spec["moments"].items()},
            "plies": plies,
        })
        # print the SAN at each moment so the captions can be checked by eye
        for k, text in spec["moments"].items():
            print(f"  game {spec['id']} ply {k}: {plies[k]['san']:>7}  <- {text[:48]}")
    with open(sys.argv[2], "w", encoding="utf-8") as fh:
        json.dump(out, fh, separators=(",", ":"))

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
            for side in ("White", "Black"):
                h[side] = "Luminex" if h[side].startswith("Luminex") else "Stash 29"
            h["Event"] = "OpenBench test 20: Luminex vs Stash 29"
            h["Site"] = "https://bench.luminexchess.com/test/20/"
            h.pop("ScaleFactor", None)
            g.comment = (f"{spec['title']}. Luminex development build against Stash 29, "
                         "10+0.1 scaled to the worker's speed. Each move's comment is the "
                         "moving engine's own score, from its side's point of view, and its "
                         "search depth.")
            print(g, file=fh, end="\n\n")
    print(f"wrote {len(SHOWCASE)} games to {sys.argv[3]}")


if __name__ == "__main__":
    main()
