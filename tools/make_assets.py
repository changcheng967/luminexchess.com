"""Build the luminexchess.com image assets from the engine's logo.

    python -I tools/make_assets.py path/to/Luminex/luminex.jpg site

Writes into the site directory: favicon.ico, assets/img/{knight.webp,
mark-64.png, apple-touch-icon.png, icon-192.png, icon-512.png, og.png}.
Needs Pillow with WebP support. The Open Graph text uses Segoe UI from
C:\\Windows\\Fonts; point FONTS elsewhere on other systems.
"""
import os
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont

SRC, SITE = sys.argv[1], sys.argv[2]
FONTS = r"C:\Windows\Fonts"
IMG = os.path.join(SITE, "assets", "img")
os.makedirs(IMG, exist_ok=True)

logo = Image.open(SRC).convert("RGB")

# Hero image: the full logo, downscaled (the page feathers its square edges with a CSS mask).
logo.resize((720, 720), Image.LANCZOS).save(os.path.join(IMG, "knight.webp"), "WEBP", quality=84, method=6)

# Square crop around the knight and its particles for icons.
crop = logo.crop((236, 196, 796, 756))          # 560 x 560
crop.resize((64, 64), Image.LANCZOS).save(os.path.join(IMG, "mark-64.png"), optimize=True)
crop.resize((180, 180), Image.LANCZOS).save(os.path.join(IMG, "apple-touch-icon.png"), optimize=True)
crop.resize((192, 192), Image.LANCZOS).save(os.path.join(IMG, "icon-192.png"), optimize=True)
crop.resize((512, 512), Image.LANCZOS).save(os.path.join(IMG, "icon-512.png"), optimize=True)
crop.resize((48, 48), Image.LANCZOS).save(os.path.join(SITE, "favicon.ico"), sizes=[(16, 16), (32, 32), (48, 48)])

# Open Graph card, 1200 x 630: the logo at the left fading into the background,
# the wordmark in a cyan-to-violet gradient, a subtitle and the domain.
OW, OH = 1200, 630
bg_top, bg_bot = (8, 14, 34), (6, 9, 24)
og = Image.new("RGB", (OW, OH))
d = ImageDraw.Draw(og)
for y in range(OH):
    t = y / (OH - 1)
    d.line([(0, y), (OW, y)], fill=tuple(round(a + (b - a) * t) for a, b in zip(bg_top, bg_bot)))
side = 600
art = logo.resize((side, side), Image.LANCZOS)
fade = Image.new("L", (side, side), 255)
fd = ImageDraw.Draw(fade)
for x in range(side):               # fade the right third of the logo
    a = 255 if x < side * 0.62 else round(255 * max(0.0, 1 - (x - side * 0.62) / (side * 0.38)))
    fd.line([(x, 0), (x, side)], fill=a)
rim = Image.new("L", (side, side), 0)   # and its outer rim
ImageDraw.Draw(rim).ellipse((30, 30, side - 30, side - 30), fill=255)
rim = rim.filter(ImageFilter.GaussianBlur(60))
mask = Image.composite(fade, Image.new("L", (side, side), 0), rim)
og.paste(art, (10, (OH - side) // 2), mask)

f_title = ImageFont.truetype(os.path.join(FONTS, "segoeuib.ttf"), 128)
f_sub = ImageFont.truetype(os.path.join(FONTS, "segoeui.ttf"), 38)
f_dom = ImageFont.truetype(os.path.join(FONTS, "seguisb.ttf"), 30)
tx, ty = 590, 205
title = "Luminex"
tb = d.textbbox((0, 0), title, font=f_title)
tw, th = tb[2] - tb[0], tb[3] - tb[1]
grad = Image.new("RGB", (tw + 8, th + 40))
gd = ImageDraw.Draw(grad)
c0, c1 = (110, 231, 249), (167, 139, 250)
for x in range(grad.width):
    t = x / max(1, grad.width - 1)
    gd.line([(x, 0), (x, grad.height)], fill=tuple(round(a + (b - a) * t) for a, b in zip(c0, c1)))
tmask = Image.new("L", grad.size, 0)
ImageDraw.Draw(tmask).text((-tb[0], -tb[1] + 10), title, font=f_title, fill=255)
og.paste(grad, (tx, ty), tmask)
d = ImageDraw.Draw(og)
d.text((tx + 4, ty + th + 48), "UCI chess engine · NNUE · C++23", font=f_sub, fill=(200, 211, 240))
d.text((tx + 4, ty + th + 104), "Open source · SPRT-tested · GPL-3.0", font=f_sub, fill=(140, 153, 190))
d.text((tx + 4, OH - 92), "luminexchess.com", font=f_dom, fill=(110, 231, 249))
og.save(os.path.join(IMG, "og.png"), optimize=True)

for root, _, files in os.walk(SITE):
    for f in files:
        if f.endswith((".png", ".webp", ".ico")):
            p = os.path.join(root, f)
            print(f"  {os.path.relpath(p, SITE):28s} {os.path.getsize(p) / 1024:7.1f} KB")
