# luminexchess.com

The homepage of [Luminex](https://github.com/changcheng967/Luminex), an open-source UCI chess engine.

- `site/` is the whole website: plain HTML, CSS and JavaScript with no build step and no
  third-party requests, apart from one call to the GitHub API for the latest release (the
  page ships v6.3.0 links as a fallback).
- `tools/make_assets.py` regenerates the images in `site/assets/img` and `site/favicon.ico`
  from the engine's `luminex.jpg`.
- `site/assets/data/` holds the two games in the viewer: `games.json`, read by
  `site/assets/js/viewer.js`, and the same games as PGN. `tools/select_games.py` ranks
  candidate wins in OpenBench PGNs and `tools/export_games.py` writes both files; their
  docstrings say which archive the current games come from.

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

- Release information updates itself from GitHub; bump the fallback links in
  `site/index.html` when a new release ships.
- After editing CSS or JavaScript, raise the `?v=` number on its `<link>` or `<script>` tag
  so browsers fetch the new file.
- The test record, the Stash ladder and the speed figures are written into `site/index.html`
  by hand, with an "as of" date; update them when new tests finish.
