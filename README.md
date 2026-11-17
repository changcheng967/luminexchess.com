# luminexchess.com

The website of [Luminex](https://github.com/changcheng967/Luminex), an open-source UCI chess engine.

`site/` is the whole website: plain HTML, CSS and JavaScript with no build step and no
third-party requests, apart from one call a page to the GitHub API for the latest release
and, on the download page, the current development build (the pages carry the current
release's links as a fallback).

## Pages

| Address | File | What it holds |
|---|---|---|
| `/` | `site/index.html` | The opening (a real game, played by scrolling), the release's strength (the gauntlet, and the match against the release before it), the method, three scenes from inside the engine, the chronicle with the rating chart, downloads |
| `/games/` | `site/games/index.html` | The game viewer: two wins over Stash 37 with both engines' scores |
| `/tests/` | `site/tests/index.html` | The record of every SPRT, and what is not in it |
| `/engine/` | `site/engine/index.html` | The six parts, the search explained step by step, speed, the clock, the network and its four generations, training |
| `/download/` | `site/download/index.html` | Every build of the release, the development build, how to run and build it, questions |
| any missing page | `site/404.html` | A lone knight |

Addresses from the time the site was one page still work: `/#strength`, `/#testing`,
`/#engine`, `/#history` and `/#download` are sections of the home page, and `/#games`,
`/#network` and `/#faq` are sent on to their new pages by `home.js`.

## How it is put together

- `site/assets/css/site.css` is shared by every page; `home.css` and `pages.css` add the
  home page and the other pages. Two surfaces carry the design: the **stage** (dark in
  both themes) and **paper** (ivory by day, near-black by night). Amber is Luminex's
  light, blue is the opponent, grey is a draw.
- `site/assets/js/theme.js` runs in `<head>`: it marks the document `js` and, unless the
  visitor prefers reduced motion or has used the footer's "Reduce motion" switch, `motion`.
  Every scroll scene is keyed on `html.motion`, so without scripts or with reduced motion
  each page is complete and still.
- `site.js` holds what every page shares: scroll scenes (`Lux.scene`), the header, the
  rail, the pointer, the release lookup, and the rolling number a page script may ask for.
  `board.js` draws a board from a FEN. `home.js`, `viewer.js`, `tests.js`, `engine.js` and
  `notfound.js` belong to one page each.
- Animations move `transform` and `opacity` only. The Content Security Policy allows no
  inline styles, so scripts place things by setting CSS custom properties
  (`element.style.setProperty`).
- A link from another page to an anchor (`/#gauntlet`) arrives while the page is still
  taking its size: the home page's opening gets its scroll track, thousands of pixels, only
  when its game file is here. `site.js` therefore keeps the target in place until the page
  has settled or the visitor does something, and only then marks the document `is-settled`,
  which switches on smooth scrolling between anchors. A scene that changes the page's height
  after its data arrives asks for that wait with `Lux.wait()` and calls what it gets back
  when it is done. An anchor's target stops 96 px from the top (`scroll-padding-top` on the
  page plus `scroll-margin-top` on `[id]`).

## Design rules

The site was audited with [unslop](https://github.com/heydamir/unslop) by Damir Sokolovsky
on 17 November 2026 and these are the rules that came out of it. They are what keeps the
pages from reading as generated; a change that breaks one needs a reason.

- **Direction.** Exact, evidential, unhurried. The world is a tournament hall after hours
  and its paperwork: one lamp over a board, score sheets, crosstables. Two moments carry
  the richness: the board that replays a real game, and the evidence drawn as data (the
  gauntlet's plot, the record of tests with their intervals). Everything around them is
  quiet. The signature is the measured rule: the tick-marked line under "measured" and the
  ± beside every measured figure, and nowhere else.
- **Type.** The display serif is for first and second level headings only (`.h-xl`, `.h-l`);
  everything else is the text face at 400, 500 or 600. No italics. Labels are sentence case
  in the mono face at 12 px with no letter-spacing; negative tracking only on display sizes.
  A heading, a label, a button and a one-sentence caption end without a full stop.
- **Colour.** One accent, used for the primary action, a selection and the figure that
  matters. No glows, no coloured shadows, no washes behind content: depth is a surface step
  and a hairline. The one light is the lamp over the opening's board.
- **Shape and space.** Radii by size (`--r-s` 6 tags, `--r-c` 10 controls, `--r-m` 12 rows,
  `--r-l` 16 cards); nothing is a full pill except a switch. Spacing sits on a 4 px grid;
  an odd value stays only where it centres something. Icons are 18 px with a 1.5 stroke.
- **Motion.** Kept where it explains: the game that plays with the scroll, the steps of the
  search, the chart that follows the chronicle, a piece moving. One easing curve
  (`--ease-out`), 150 ms for feedback and at most 500 ms for a change. Nothing loops, nothing
  moves on hover, nothing rises into place as the page scrolls. The pieces being set on the
  opening's board is the one entrance. The custom pointer stays on the owner's wish.
- **Numbers.** One format a figure wherever it appears; tabular figures where a number
  changes in place or sits in a column.

## Tools

- `tools/stamp.py site` keeps the repeated parts in step and checks the pages. A page marks
  a region with `<!-- @name -->` and `<!-- /@name -->`; the tool rewrites what is between
  them: the icon sprite, header and footer from `tools/parts/`, the starting position's
  pieces, the test charts and rows from `site/assets/data/tests.json`, the gauntlet
  figure from `site/assets/data/gauntlet.json`, and the note about the Computer Chess Index
  from `site/assets/data/cci.json`. Inside a sentence, a value between
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
- `tools/serve.py site 8137` serves the site locally with the headers from `site/_headers`.
- `tools/make_assets.py http://127.0.0.1:8137 site` redraws the icons and the link-preview
  card from the site's own knight, fonts and styles (needs Playwright and a local Chrome).
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
    network is always written by its real file name (`luminex_gen768r_06q_i8.nnue`), never
    by an older network's name or a neutral one.
  - `/`: the opening's pill and numbers, "Where it stands" (the gauntlet's `title` and
    `since` in `gauntlet.json`, the release against the one before it as one result
    row, and the CCI note: `tools/bench_update.py --cci` once `softwareVersion` names
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
  block of the network that was rated), anything else is stale. Three fields of
  `gauntlet.json` are written by hand and kept when the same gauntlet is read again:
  `title` (the figure's heading; without it, "The development build, against … engines"),
  `since` (a sentence after the figure's text: what the engine has become since) and
  `noteEnd` (a sentence added to the note under the rows). A new gauntlet starts without
  them.
- **A new network on main.** In `site/assets/data/tests.json`, label its test "Passed; on
  main" and the one before it "Passed; since replaced by …" (a released network keeps
  "Passed; released in v…"). On `/engine/`: a row in the table of networks and the note
  under it. On the home page: the chronicle's "Next" entry. On `/download/`: the network
  the development build carries, with its test. The pages describe the release, so the
  release's own figures wait for the next release: the four training counters and the
  table of phases on `/engine/` (a step is 131,072 positions), the sentence about positions
  shown on the home page, and the `since` sentence in `gauntlet.json`.
- **CCI.** The Computer Chess Index, an independent list, adds games every day, so its
  figures for a new release move for weeks. `tools/bench_update.py` says when its page has
  moved on; `tools/bench_update.py --cci`, then `tools/stamp.py`, bring the note under "Where
  it stands" along. The note quotes the list's own figures for the release: the rating, its
  range and the games at each time control, on the machine that has played the most, with
  the date of the list's page. While any range is wider than ± 60 it calls them early
  readings (`EARLY` in `tools/stamp.py`); before the list has played the release it says so.
  It is the one place the site quotes CCI, and it never shows an older version's figures.
- **Strength.** The release's match against the one before it and the rating chart's
  points (`data-points`) are in `site/index.html`; the gauntlet figure comes from
  `gauntlet.json`; the footnote is in `tools/parts/footer.html`.
- **The engine.** Speed figures, the clock section, the network's layers and generations
  and the training text are in `site/engine/index.html`; the chronicle is in
  `site/index.html`.
- After editing CSS or JavaScript, raise the `?v=` number on its `<link>` or `<script>` tag
  in every page so browsers fetch the new file.
