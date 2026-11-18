#!/usr/bin/env python3
"""Draw the site's marks, icons and link-preview card from the Luminex logo.

    python -I tools/logo_assets.py LOGO.jpg site

LOGO.jpg is the logo as its author drew it: luminex.jpg at the top of the engine
repository (changcheng967/Luminex, "Add the Luminex logo"), 1024 x 1024, a knight in
light on deep navy. Needs Pillow, and Playwright with a local Chrome for the card.

Writes into site/:
    favicon.ico, assets/img/mark-64.png, mark-128.png, mark-256.png, mark.svg,
    icon-192.png, icon-512.png, apple-touch-icon.png   the logo as a rounded tile, its own
                                                        background kept (the same in both themes)
    assets/img/knight-glow.png                          the logo's light alone, taken off its
                                                        background: knight.js builds the living
                                                        knight from it, one square per 4 pixels
    assets/img/og.png                                   the link-preview card, 1200 x 630
"""
import base64
import io
import os
import sys

from PIL import Image, ImageDraw, ImageFilter

SRC, SITE = sys.argv[1], sys.argv[2]
IMG = os.path.join(SITE, "assets", "img")
CX, CY, HALF = 515, 499, 336          # the knight and its cloud of squares, in the 1024 px original


def rounded(im, frac=0.22):
    im = im.convert("RGBA")
    m = Image.new("L", im.size, 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, im.size[0] - 1, im.size[1] - 1), radius=int(im.size[0] * frac), fill=255)
    im.putalpha(m)
    return im


def small(im, path, colours=True):
    """PNG with a palette of 256 colours: the glow survives, the file is a fifth of the size."""
    if colours:
        im = im.quantize(256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.FLOYDSTEINBERG) if im.mode == "RGBA" \
            else im.convert("RGB").quantize(256, dither=Image.Dither.FLOYDSTEINBERG)
    im.save(path, optimize=True)


src = Image.open(SRC).convert("RGB")
tile = src.crop((CX - HALF, CY - HALF, CX + HALF, CY + HALF))
small(rounded(tile.resize((64, 64), Image.LANCZOS)), os.path.join(IMG, "mark-64.png"), colours=False)
for n in (128, 256):
    small(rounded(tile.resize((n, n), Image.LANCZOS)), os.path.join(IMG, "mark-%d.png" % n))
small(rounded(tile.resize((192, 192), Image.LANCZOS)), os.path.join(IMG, "icon-192.png"))
small(rounded(tile.resize((512, 512), Image.LANCZOS)), os.path.join(IMG, "icon-512.png"))
small(tile.resize((180, 180), Image.LANCZOS), os.path.join(IMG, "apple-touch-icon.png"))     # iOS rounds it itself
ico = [rounded(tile.resize((s, s), Image.LANCZOS)) for s in (16, 32, 48)]
ico[2].save(os.path.join(SITE, "favicon.ico"), sizes=[(16, 16), (32, 32), (48, 48)], append_images=ico[:2])
b64 = base64.b64encode(open(os.path.join(IMG, "mark-64.png"), "rb").read()).decode()
with open(os.path.join(IMG, "mark.svg"), "w", encoding="utf-8", newline="\n") as fh:
    fh.write('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><image width="64" height="64" href="data:image/png;base64,%s"/></svg>\n' % b64)

# the light alone: a minimum filter takes the thin bright strokes out, a blur leaves the background's
# gradient; what rises above it is the logo, un-blended from that background ("unscreened")
crop = tile.resize((320, 320), Image.LANCZOS)
bg = crop.filter(ImageFilter.MinFilter(9)).filter(ImageFilter.GaussianBlur(14))
px, bp = crop.load(), bg.load()
glow = Image.new("RGBA", crop.size)
gp = glow.load()
for y in range(crop.size[1]):
    for x in range(crop.size[0]):
        c, k = px[x, y], bp[x, y]
        a = max(0.0, min(1.0, (max(c[0] - k[0], c[1] - k[1], c[2] - k[2]) - 10) / 190.0))
        gp[x, y] = (0, 0, 0, 0) if a <= 0 else tuple(int(max(0, min(255, (v - w * (1 - a)) / a))) for v, w in zip(c, k)) + (int(a * 255),)
glow.save(os.path.join(IMG, "knight-glow.png"), optimize=True)

# the card: the site's own fonts, drawn by the browser
site = os.path.abspath(SITE).replace("\\", "/")
html = """<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: B; src: url("file:///%(s)s/assets/fonts/bodoni-moda.woff2"); }
@font-face { font-family: B; src: url("file:///%(s)s/assets/fonts/bodoni-moda-italic.woff2"); font-style: italic; }
@font-face { font-family: M; src: url("file:///%(s)s/assets/fonts/fragment-mono.woff2"); }
html, body { margin: 0; width: 1200px; height: 630px; background: radial-gradient(120%% 90%% at 78%% 40%%, #0b1a33 0%%, #050a14 62%%); color: #edf3ff; overflow: hidden; }
.k { position: absolute; right: 40px; top: 15px; width: 600px; height: 600px; }
.t { position: absolute; left: 72px; top: 150px; font: 400 92px/0.95 B; letter-spacing: -0.02em; }
.t em { font-style: italic; background: linear-gradient(100deg, #6fe6f5 10%%, #a39cf5 95%%); -webkit-background-clip: text; color: transparent; filter: drop-shadow(0 0 22px rgba(111,230,245,0.4)); padding-right: 6px; }
.b { position: absolute; left: 72px; top: 64px; display: flex; align-items: center; gap: 16px; font: 500 40px/1 B; }
.b img { width: 52px; height: 52px; border-radius: 12px; box-shadow: 0 0 0 1px rgba(190,215,255,0.18); }
.s { position: absolute; left: 72px; bottom: 64px; font: 400 22px/1.4 M; color: #9aa6c4; }
</style></head><body>
<img class="k" src="file:///%(s)s/assets/img/knight-glow.png">
<div class="b"><img src="file:///%(s)s/assets/img/mark-128.png">Luminex</div>
<div class="t">Every idea,<br><em>measured</em><br>before it plays</div>
<div class="s">A free, open-source chess engine<br>luminexchess.com</div>
</body></html>""" % {"s": site}
card = os.path.join(os.path.dirname(os.path.abspath(SITE)), ".og-card.html")
with open(card, "w", encoding="utf-8") as fh:
    fh.write(html)
try:
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        b = p.chromium.launch(channel="chrome", headless=True, args=["--allow-file-access-from-files"])
        page = b.new_page(viewport={"width": 1200, "height": 630})
        page.goto("file:///" + card.replace("\\", "/"), wait_until="load")
        page.wait_for_timeout(800)
        shot = Image.open(io.BytesIO(page.screenshot()))
        b.close()
    small(shot, os.path.join(IMG, "og.png"))
finally:
    os.remove(card)
for f in ("mark-64.png", "mark-128.png", "mark-256.png", "icon-192.png", "icon-512.png", "apple-touch-icon.png", "knight-glow.png", "og.png"):
    print("%-22s %7d bytes" % (f, os.path.getsize(os.path.join(IMG, f))))
