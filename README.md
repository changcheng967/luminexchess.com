# luminexchess.com

The website of [Luminex](https://github.com/changcheng967/Luminex), an open-source UCI chess engine.

`site/` is the whole website: plain HTML, CSS and JavaScript with no build step and no
third-party requests, apart from one call to the GitHub API for the latest release (the
pages carry v6.5.1 links as a fallback).

## Pages

| Address | File | What it holds |
|---|---|---|
| `/` | `site/index.html` | The opening (a real game, played by scrolling), the Stash ladder, the method, three scenes from inside the engine, the chronicle with the rating chart, downloads |
| `/games/` | `site/games/index.html` | The game viewer: two wins over Stash 29 with both engines' scores |
| `/tests/` | `site/tests/index.html` | The four steps a change goes through, and the record of every SPRT |
| `/engine/` | `site/engine/index.html` | The six parts, the search explained step by step, speed, the network, training |
| `/download/` | `site/download/index.html` | Every build, how to run and build it, questions |
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
- `tools/serve.py site 8137` serves the site locally with the headers from `site/_headers`.
- `tools/make_assets.py http://127.0.0.1:8137 site` redraws the icons and the link-preview
  card from the site's own knight, fonts and styles (needs Playwright and a local Chrome).
- `tools/select_games.py` and `tools/export_games.py` choose and write the two games in
  `site/assets/data/` (`games.json` and the PGN); their docstrings name the archive the
  current games come from.

## Hosting

Cloudflare Pages serves `site/` at https://luminexchess.com, and every push to `main` redeploys.

| Pages setting | Value |
|---|---|
| Production branch | `main` |
| Framework preset | None |
| Build command | *(empty)* |
| Build output directory | `site` |

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

- **A new release.** Release names, dates, links and sizes update themselves from GitHub.
  Bump the fallbacks (search for the old tag) in `site/index.html` and
  `site/download/index.html`, and `softwareVersion` in the home page's JSON-LD.
- **A finished test.** Add it to `site/assets/data/tests.json` and run `tools/stamp.py`;
  that redraws the chart on the home page and the rows on `/tests/`. The totals (SPRTs run,
  passed, games) and the "as of" date are written by hand in `site/index.html` and
  `site/tests/index.html`.
- **Strength.** The Stash ladder, the three fact cards and the rating chart's points
  (`data-points`) are in `site/index.html`; the footnote is in `tools/parts/footer.html`.
- **The engine.** Speed figures, the network's layers and the training text are in
  `site/engine/index.html`; the chronicle is in `site/index.html`.
- After editing CSS or JavaScript, raise the `?v=` number on its `<link>` or `<script>` tag
  in every page so browsers fetch the new file.
