# luminexchess.com

The homepage of [Luminex](https://github.com/changcheng967/Luminex), an open-source UCI chess engine.

- `site/` is the whole website: plain HTML, CSS and JavaScript with no build step and no
  third-party requests, apart from one call to the GitHub API for the latest release (the
  page ships v6.3.0 links as a fallback).
- `tools/make_assets.py` regenerates the images in `site/assets/img` and `site/favicon.ico`
  from the engine's `luminex.jpg`.

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
python -m http.server 8137 --directory site
```

Then open http://localhost:8137.

## Updating

- Release information updates itself from GitHub; bump the fallback links in
  `site/index.html` when a new release ships.
- After editing CSS or JavaScript, raise the `?v=` number on its `<link>` or `<script>` tag
  so browsers fetch the new file.
