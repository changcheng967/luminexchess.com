# luminexchess.com

The website of [Luminex](https://github.com/changcheng967/Luminex), an open-source UCI chess engine.

`site/` is the whole website: plain HTML, CSS and JavaScript with no build step and no
third-party requests, apart from one call a page to the GitHub API for the latest release
and, on the download page, the current development build (the pages carry the current
release's links as a fallback), and Lichess's public API while the home page's Lichess card
is on screen (the card carries a copy of everything it shows, taken at the last build).

## Pages

| Address | File | What it holds |
|---|---|---|
| `/` | `site/index.html` | The ride (a real position pulled back to every game the bench has played), the strength (the newest gauntlet, the release against the one before it, the Computer Chess Index, and the bot luminexbot live on Lichess), the method, three scenes from inside the engine, the chronicle with the rating chart, downloads |
| `/games/` | `site/games/index.html` | The game viewer: the two wins in gauntlet 3 against Obsidian v16.0 and Berserk 14, with both engines' scores |
| `/tests/` | `site/tests/index.html` | The record of every SPRT, and what is not in it |
| `/engine/` | `site/engine/index.html` | A search growing in light behind the title; real searches replayed live; the six parts, each a moving glyph; the search explained step by step; speed, felt; the clock, with a simulator of the engine's own time manager; the network, its inputs and V5's relations lit on a board, its generations; training, its runs drawn as a lineage |
| `/download/` | `site/download/index.html` | Every build of the release, the development build, how to run and build it, questions |
| any missing page | `site/404.html` | A lone knight |

Addresses from the time the site was one page still work: `/#strength`, `/#testing`,
`/#engine`, `/#history` and `/#download` are sections of the home page, and `/#games`,
`/#network` and `/#faq` are sent on to their new pages by `home.js`.

## How it is put together

- `site/assets/css/site.css` is shared by every page; `home.css` and `pages.css` add the
  home page and the other pages. The colours are the logo's: deep navy, cool ink, and one
  light, cyan running into violet, that means Luminex or a win. Amber is the opponent. By
  day the same site is printed on cool paper and the light becomes a deep teal ink.
- `site/assets/js/theme.js` runs in `<head>`: it marks the document `js` and, unless the
  visitor prefers reduced motion or has used the footer's "Reduce motion" switch, `motion`.
  Every scroll scene is keyed on `html.motion`, so without scripts or with reduced motion
  each page is complete and still.
- `site.js` holds what every page shares: scroll scenes (`Lux.scene`), the header, the
  rail, the pointer, the release lookup, things coming into the light once (`data-rise`),
  and the rolling number a page script may ask for. `board.js` draws a board from a FEN.
  `cells.js` holds the cells (one game a cell: the seeded scatter of a run's results, the
  colours, the wall of every run in boards of 64) and the chess the figures need
  (`Lux.chess`: a FEN's squares, what a piece attacks). `ride.js` is the home page's ride,
  `knight.js` the living logo, `wallview.js` the tests page's wall, `inputs.js` the engine
  page's inputs and V5's relations, `think.js` its replayed searches, `tree.js` the search
  growing behind its title, `clock.js` its clock simulator, `term.js` the download page's terminal
  (a recorded session replayed at the engine's pace); `home.js` (the ride's sections: the ladder
  drawn from the gauntlet's rows, the four steps running the strip's newest tests, the chronicle),
  `viewer.js` (with the games page's field of every game), `tests.js` (with the river of every
  test), `engine.js` and `notfound.js` belong to one page each. `lichess.js` is the home
  page's Lichess card: while it is on screen it reads the bot account from Lichess's public
  API (ratings, the games since the copy, and the game in progress, streamed move by move)
  over the copy the page carries, one request at a time, and reads nothing when the card is
  off screen or the tab hidden.
- Animations move `transform` and `opacity` only. The Content Security Policy allows no
  inline styles, so scripts place things by setting CSS custom properties
  (`element.style.setProperty`).
- On a window 900 px or wider the home page's opening lies over the ride's first scale.
  `ride.js` (`layout()`) lets the drawing begin at `max(47vw, min(50vw, 700px))`, and
  `home.css` stops the opening's words 40 px short of that line and sizes its title to the
  column that leaves (`cqi`), so the words never run under the board: change both together.
- A link from another page to an anchor (`/#gauntlet`) arrives while the page is still
  taking its size: the home page's opening gets its scroll track, thousands of pixels, only
  when its game file is here. `site.js` therefore keeps the target in place until the page
  has settled or the visitor does something, and only then marks the document `is-settled`,
  which switches on smooth scrolling between anchors. A scene that changes the page's height
  after its data arrives asks for that wait with `Lux.wait()` and calls what it gets back
  when it is done. An anchor's target stops 96 px from the top (`scroll-padding-top` on the
  page plus `scroll-margin-top` on `[id]`).

## Design

Redesigned on 18 November 2026 from one idea, at the owner's wish to think again from
scratch (the rules of the unslop audit of 17 November no longer bind the site; its facts
discipline does).

- **The idea: one square of light is one game.** The logo is a knight whose mane breaks
  into squares of light; the site takes those squares as its unit. A lit cell is a win, a
  dim one a draw, a dark one a loss, and cells are laid out in boards of 64. The home page
  opens on a real position and pulls back, as the page scrolls, to the game it is a frame
  of, the match that game is one cell of, the gauntlet of twelve matches, and the wall of
  every game the bench has played (`ride.js`). The same cells draw the match beside each
  game, the wall on the tests page and the network's inputs on the engine page.
- **The logo** is the owner's (`luminex.jpg` in the engine repository), used as drawn: a
  rounded tile in the header, footer and icons, and alive at the end of the home page and
  above the phone hero, rebuilt from its own light one square per few pixels (`knight.js`).
- **Light means something.** Glow is kept for what is lit: a win, Luminex's figures, the
  word "measured", the thing under the pointer. Pieces light the squares they attack, as
  64-bit masks the engine would hold.
- **Type.** Bodoni Moda for words read once (headings, big figures, its italic for the lit
  word), Schibsted Grotesk for words read through, Fragment Mono for anything measured.
- **Motion** comes from scrolling and from the pointer: the camera pulls back, figures roll
  into place, the knight's squares scatter and settle. Nothing loops. Every scene has a
  still form without motion, and the custom pointer stays on the owner's wish.
- **Facts.** Every Elo exactly as its test page shows it; one number for a thing on a page;
  never an older state's number beside the current one.

## Tools

- `tools/think_record.py ENGINE tools/think_positions.json raw.json` records main's engine
  thinking on the showcase positions (`go movetime 10000`, one thread, Hash 64; every line kept),
  and `tools/think_json.py tools/think_positions.json raw.json site/assets/data/games.json
  site/assets/data/think.json` turns that into the engine page's replays: the engine's own lines,
  each line's time as nodes / nps (the lines carry none), the moves in notation by python-chess,
  and the search's real end. The stories under each replay are in `think_json.py` and are checked
  against the recording by hand. Record with main's development build (its network inside) and
  name the machine in `about`. The opening's tree (`tree.js`) reads the first search; the download
  page's terminal (`term.js`) replays each search as a session, from the `position` command the
  recording sent to the `bestmove` (with its `ponder`) the engine answered.
- `tools/stamp.py site` keeps the repeated parts in step and checks the pages. A page marks
  a region with `<!-- @name -->` and `<!-- /@name -->`; the tool rewrites what is between
  them: the icon sprite, header and footer from `tools/parts/`, the starting position's
  pieces, the test charts and rows from `site/assets/data/tests.json` (the home page's
  strip is drawn at its own scale, a 24 px column a test, 250 px high, and scrolls
  sideways in a narrower frame), the gauntlet
  figure from `site/assets/data/gauntlet.json`, the figure for the Computer Chess Index
  from `site/assets/data/cci.json`, and the Lichess card's still form from
  `site/assets/data/lichess.json`. Inside a sentence, a value between
  `<!--@g:key-->` and `<!--/@g:key-->` is filled from `gauntlet.json` too (keys: `rating`,
  `n`, `e`, `games`, `day`, `count`, `tc`, `list`, `network`), so the pages and the
  footer quote the newest gauntlet without an edit. It then reports anything the Content
  Security Policy would block and any local link that leads nowhere, and dates the pages in
  `sitemap.xml` (today for a page with uncommitted changes, otherwise its last commit).
  **Run it after editing a part, a page or a data file.** Dates the tools write are UTC,
  like GitHub's, the bench's and the names of the development builds.
- `tools/bench_update.py` reads OpenBench and reports what the site should say: the totals
  (SPRTs run, passed, games), any finished SPRT that `tests.json` does not have yet (as an
  entry ready to paste, with the title left for you), any row that no longer matches the
  list or its own test page (every row's page is read; `--no-pages` skips that), and
  a finished gauntlet newer than the one shown. With `--write` it also writes the totals,
  the sentence under them on the tests page, the "as of" date, and the Elo, interval and
  games of every row that differs from its test page. With `--gauntlet N` it
  writes `gauntlet.json` from that gauntlet's page, keeps the gauntlet shown until then in
  it as `previous`, and lists the lines that still quote that one. With `--cci` it writes
  `cci.json` from the Computer Chess Index's page for Luminex, and the plain report says
  when that page has moved on from the file. It fetches through `ssh -n oracle` by
  default (`--via ""` fetches from this machine). The count of games is the bench's own
  (its Users page), which includes games of workloads deleted later; the sum over the
  listed workloads does not.
  The home page's ride does not read `gauntlet.json`: it zooms out from a game of gauntlet 3 to
  that gauntlet's twelve matches, so it draws `site/assets/data/gauntlet-3.json`, a copy kept as
  it was. A new gauntlet changes the strength figure, the footnote and every `@g` value, not the
  ride. Before writing a new gauntlet, drop `previous` from the file if the figure should not set
  the older rating beside the new one (it did not on 19 November).
- `tools/serve.py site 8137` serves the site locally with the headers from `site/_headers`.
- `tools/logo_assets.py ../Luminex/luminex.jpg site` draws the marks, icons, favicon, the
  light-only knight that `knight.js` builds the living logo from, and the link-preview card,
  all from the logo at the top of the engine repository (needs Pillow, and Playwright with a
  local Chrome for the card).
- `tools/wall.py` writes `site/assets/data/wall.json`: every run on the bench with its wins,
  draws and losses, read-only from the bench server's database through `ssh oracle`, for the
  wall of games (the home page's ride and the tests page). Run it with `bench_update.py --write`
  so the wall's cells and the count of games beside it come from the same moment.
- `tools/lichess.py` takes the copy of the bot account luminexbot that the home page's Lichess
  card carries, `site/assets/data/lichess.json`: its ratings with their histories, every game
  it has played against another account (as Lichess counts them on its profile, so games
  against Lichess's own computer are left out) and the last game's final position. `--check`
  says how far the copy is behind Lichess. It reads Lichess from this machine, one request at
  a time. Then run `tools/stamp.py`.
- `tools/select_games.py` and `tools/export_games.py` choose and write the two games in
  `site/assets/data/` (`games.json` and the PGN); their docstrings name the archive the
  current games come from.

## Hosting

A Cloudflare Worker named `luminexchess-com` serves `site/` as static assets at
https://luminexchess.com; there is no Worker script. Cloudflare's Workers Builds is connected
to this repository:

- every push to `main` runs `wrangler deploy` and is live in about 40 seconds;
- every push to another branch runs `wrangler preview` and publishes a preview of that branch.

`wrangler.jsonc` holds what both need: the Worker's name, `site/` as the assets directory,
`not_found_handling: "404-page"` (an address that matches no file gets `site/404.html` with
status 404) and the `previews` block that `wrangler preview` refuses to run without.

`site/_headers` sets the security headers (including a strict Content Security Policy) and
the cache lifetimes. The OpenBench instance at https://bench.luminexchess.com runs
elsewhere, behind a Cloudflare Tunnel, and is not part of this repository.

The policy admits one script from outside: Cloudflare's Web Analytics beacon
(`https://static.cloudflareinsights.com`). Cloudflare adds its `<script>` tag to every page
at its edge, for browsers only, so it is in no file of this repository and `curl` does not
see it; the beacon reports to the site's own `/cdn-cgi/rum`, which `connect-src 'self'`
covers. Without the entry the policy blocks the script, every page logs an error in the
console, and Cloudflare counts no page views. To stop counting instead, turn Web Analytics
off for the site in the Cloudflare dashboard and take the host out of `script-src`.

A check of the live site needs a real browser for that reason: file hashes compared from
another machine miss what Cloudflare adds. From a network that cannot reach the domain,
open `ssh -N -D 1085 <server>` and point the browser at `socks5://127.0.0.1:1085`.

## Preview locally

```bash
python -I tools/serve.py site 8137
```

Then open http://127.0.0.1:8137. The server applies `site/_headers`, including the Content
Security Policy, so anything the policy would block in production shows up in the browser
console.

## Updating

- **A new release.** Release names, dates, links and sizes update themselves from GitHub
  in the visitor's browser, and the download page's Network card finds the release's
  `.nnue` file by its ending, so a renamed network is followed. The pages' own text is the
  fallback and has to be brought along by hand: the tag, date, links and sizes in
  `site/index.html` and `site/download/index.html` (search for the old tag), and
  `softwareVersion` in the home page's JSON-LD. The source for the words is the release's
  notes on GitHub. Then, page by page:
  - `/download/`: the four cards, the table of every build (file, processor, what it
    needs: the notes' Downloads table), the network card's file name, the questions. A
    network is always written by its real file name (`luminex_gen768u_01q_i8.nnue`), never
    by an older network's name or a neutral one. The build commands are main's (its
    network comes from `bash .github/scripts/ci.sh fetch-net`, which every release from
    v6.7.0 has too). Since v6.7.0 there is one binary a platform; the site-tools fixtures
    (the recorded GitHub answers) are refreshed at every release.
  - `/`: the opening's pill and numbers, "Where it stands" (the gauntlet's `title` and
    `since` in `gauntlet.json`, the release against the one before it as one result
    row, and the CCI figure: `tools/bench_update.py --cci` once `softwareVersion` names
    the release), the chart's point for the release (`data-points`, the headline, the
    hidden table), a chronicle entry and the "Next" entry, the download section.
  - `/engine/`: the generation cards, the training counters, the table of phases and the
    table of networks under it; `/tests/`: the notes under the record;
    `tools/parts/footer.html`: the footnote.
- **Say a thing once.** The home page states where the release stands; the chronicle keeps
  the history, a line an event; the engine page has the tables. A block that repeats
  another, or shows an older state beside the current one (the Stash ladder that placed
  v6.5, a match of an earlier build), goes when the release moves on: git keeps it.
- **Elo figures.** Every Elo on the site is its OpenBench test page's figure: two
  decimals, with the 95% interval (+246.55 ± 13.37). `tools/bench_update.py` reads every
  row's page and corrects the record; figures in sentences are checked by hand against the
  page they link. The bench's intervals have changed with its code before, so an old
  figure in a commit message or a note is not a source.
- **A finished test.** Run `tools/bench_update.py`: it prints an entry for every finished
  SPRT that `site/assets/data/tests.json` lacks. Give it a title and a label, paste it in,
  run `tools/bench_update.py --write` for the totals and the date, then `tools/stamp.py`,
  which redraws the chart on the home page and the rows on `/tests/`. The notes under the
  record on `/tests/` are written by hand.
- **A new gauntlet.** Run `tools/bench_update.py --gauntlet N --date "13 November 2026"`
  (the date of the build that was rated), then `tools/stamp.py`. That redraws the figure on
  the home page from `gauntlet.json` (the rating, its text, every opponent's row, and a
  sentence comparing it with the gauntlet shown before, which the file keeps as
  `previous`; delete that field to leave the comparison out), and fills every value the pages quote between `<!--@g:rating-->` and
  `<!--/@g:rating-->` markers: the opening's pill and "Development build" number, the
  sentences on the tests and download pages, the footnote. Written by hand, in
  `site/index.html`: the chronicle chart's last point (`data-points`, the headline under
  the chart's title and the hidden table) and a chronicle entry. The script then lists
  every line that still quotes the gauntlet before; history may stay (the chronicle, the
  block of the network that was rated), anything else is stale. Four fields of
  `gauntlet.json` are written by hand and kept when the same gauntlet is read again:
  `title` (the figure's heading; without it, "The development build of <day>, against … engines"),
  `release` (the release whose search and network the gauntlet played, e.g. "v6.7.0": the
  figure's text says so), `since` (a sentence after the figure's text: what the engine has
  become since) and `noteEnd` (a sentence added to the note under the rows). A new gauntlet
  starts without them. A gauntlet of a release also takes the chronicle's waiting entries
  in: they lose `is-next` and point at the release's point on the chart.
- **A new network on main.** In `site/assets/data/tests.json`, label its test "Passed; on
  main" and the one before it "Passed; since replaced by …" (a released network keeps
  "Passed; released in v…"). On `/engine/`: a row in the table of networks and the note
  under it. On the home page: the chronicle's "Next" entry. On `/download/`: the network
  the development build carries, with its test. Since 22 November 2026, at the owner's
  wish, the training section on `/engine/` follows main's network, not the release: its
  four counters, the table of its runs (a step is 131,072 positions) and the text under it,
  with v6.6.0's network kept as one line of history. So do the sentence about positions
  shown on the home page and the `since` sentence in `gauntlet.json`.
- **CCI.** The Computer Chess Index, an independent list, adds games every day, so its
  figures for a new release move for weeks. `tools/bench_update.py` says when its page has
  moved on; `tools/bench_update.py --cci`, then `tools/stamp.py`, bring its figure in "Where
  it stands" along. The figure quotes the list's own numbers for the release, on the machine
  that has played the most: at each time control the rating, its range, the games, the change
  over the version the list rated before (from the page's own table), and the place on its
  complete list (`lists/CCIRatings.csv`, one row an engine) among the engines rated there,
  given only when that list's row carries the same ratings. While any range is wider than
  ± 60 it calls them early readings (`EARLY` in `tools/stamp.py`); before the list has played
  the release it is a sentence that says so. It is the one place the site quotes CCI.
- **Lichess.** The card reads Lichess live, so only its copy goes stale: run
  `tools/lichess.py`, then `tools/stamp.py`, with every update of the site. Its ratings are
  Lichess's own, against other bots; the card says they do not compare with CCRL's. The card
  watches, it never plays: nothing on the site plays against the engine. Lichess answers a
  HeadlessChrome agent's game list with 404, so automated page checks answer lichess.org from
  the copy, and a live game is checked with an ordinary agent.
- **Strength.** The release's match against the one before it and the rating chart's
  points (`data-points`) are in `site/index.html`; the gauntlet figure comes from
  `gauntlet.json`; the footnote is in `tools/parts/footer.html`.
- **The engine.** Speed figures, the clock section, the network's layers and generations
  and the training text are in `site/engine/index.html`; the chronicle is in
  `site/index.html`.
- After editing CSS or JavaScript, raise the `?v=` number on its `<link>` or `<script>` tag
  in every page so browsers fetch the new file.
