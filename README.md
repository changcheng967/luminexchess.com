# luminexchess.com

The website of [Luminex](https://github.com/changcheng967/Luminex), an open-source UCI chess engine.

`site/` is the whole website: plain HTML, CSS and JavaScript with no build step and no
third-party requests, apart from one call a page to the GitHub API for the latest release
and, on the download page, the current development build (the pages carry v6.5.1 links as
a fallback).

## Pages

| Address | File | What it holds |
|---|---|---|
| `/` | `site/index.html` | The opening (a real game, played by scrolling), the Stash ladder, the method, three scenes from inside the engine, the chronicle with the rating chart, downloads |
| `/games/` | `site/games/index.html` | The game viewer: two wins over Stash 37 with both engines' scores |
| `/tests/` | `site/tests/index.html` | The four steps a change goes through, and the record of every SPRT |
| `/engine/` | `site/engine/index.html` | The six parts, the search explained step by step, speed, the clock, the network and its four generations, training |
| `/download/` | `site/download/index.html` | Every build of the release, the development build, how to run and build it, questions |
| any missing page | `site/404.html` | A lone knight |

Addresses from the time the site was one page still work: `/#strength`, `/#testing`,
`/#engine`, `/#history` and `/#download` are sections of the home page, and `/#games`,
`/#network` and `/#faq` are sent on to their new pages by `home.js`.

## How it is put together

- `site/assets/css/site.css` is shared by every page; `home.css` and `pages.css` add the
  home page and the other pages. Two surfaces carry the design: the **stage** (the lit
  scenes, dark in both themes) and **paper** (ivory by day, near-black by night). Amber is
  Luminex's light, blue is the opponent, grey is a draw.
- `site/assets/js/theme.js` runs in `<head>`: it marks the document `js` and, unless the
  visitor prefers reduced motion or has used the footer's "Reduce motion" switch, `motion`.
  Every hidden starting state and every scroll scene is keyed on `html.motion`, so without
  scripts or with reduced motion each page is complete and still.
- `site.js` holds what every page shares: scroll scenes (`Lux.scene`), reveals, the heading
  word split, the rolling numbers, the pointer, the header, the release lookup. `board.js`
  draws a board from a FEN. `home.js`, `viewer.js`, `tests.js`, `engine.js` and
  `notfound.js` belong to one page each.
- Animations move `transform` and `opacity` only. The Content Security Policy allows no
  inline styles, so scripts place things by setting CSS custom properties
  (`element.style.setProperty`).

## Tools

- `tools/stamp.py site` keeps the repeated parts in step and checks the pages. A page marks
  a region with `<!-- @name -->` and `<!-- /@name -->`; the tool rewrites what is between
  them: the icon sprite, header and footer from `tools/parts/`, the starting position's
  pieces, and the test charts and rows from `site/assets/data/tests.json`. It then reports
  anything the Content Security Policy would block and any local link that leads nowhere.
  **Run it after editing a part, a page or `tests.json`.**
- `tools/bench_update.py` reads OpenBench and reports what the site should say: the totals
  (SPRTs run, passed, games), any finished SPRT that `tests.json` does not have yet (as an
  entry ready to paste, with the title left for you), and any row that no longer matches.
  With `--write` it also writes the totals, the sentence under them on the tests page and
  the "as of" date. It fetches through `ssh -n oracle` by default (`--via ""` fetches from
  this machine). The count of games is the bench's own (its Users page), which includes
  games of workloads deleted later; the sum over the listed workloads does not.
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

## Preview locally

```bash
python -I tools/serve.py site 8137
```

Then open http://127.0.0.1:8137. The server applies `site/_headers`, including the Content
Security Policy, so anything the policy would block in production shows up in the browser
console.

## Updating

- **A new release.** Release names, dates, links and sizes update themselves from GitHub,
  and the download page's Network card finds the release's `.nnue` file by its ending, so
  a renamed network is followed. Bump the fallbacks (search for the old tag) in
  `site/index.html` and `site/download/index.html`, and `softwareVersion` in the home
  page's JSON-LD. Then read the pages for what the release changes in words: the ladder,
  "on main now", the generation cards on `/engine/`, the released network's file name.
- **A finished test.** Run `tools/bench_update.py`: it prints an entry for every finished
  SPRT that `site/assets/data/tests.json` lacks. Give it a title and a label, paste it in,
  run `tools/bench_update.py --write` for the totals and the date, then `tools/stamp.py`,
  which redraws the chart on the home page and the rows on `/tests/`. The notes under the
  record on `/tests/` are written by hand.
- **Strength.** The Stash ladder, the three fact cards and the rating chart's points
  (`data-points`) are in `site/index.html`; the footnote is in `tools/parts/footer.html`.
- **The engine.** Speed figures, the clock section, the network's layers and generations
  and the training text are in `site/engine/index.html`; the chronicle is in
  `site/index.html`.
- After editing CSS or JavaScript, raise the `?v=` number on its `<link>` or `<script>` tag
  in every page so browsers fetch the new file.
