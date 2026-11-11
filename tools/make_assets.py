"""Build the site's icons and its link-preview card from the site's own pieces,
fonts and styles, so they always match the pages.

    python -I tools/serve.py site 8137                       (in another terminal)
    python -I tools/make_assets.py http://127.0.0.1:8137 site

Writes into the site directory: favicon.ico and assets/img/{mark.svg, mark-64.png,
apple-touch-icon.png, icon-192.png, icon-512.png, og.png}.

The icons are the knight from tools/parts/sprite.html on the stage colour. The
card (1200 x 630) is laid out with the site's stylesheet and shows a position
from site/assets/data/games.json. Needs Playwright with a local Chrome (it
renders the pictures) and Pillow (it writes the .ico and trims the files).
"""
import io
import os
import re
import sys

from PIL import Image
from playwright.sync_api import sync_playwright

BASE, SITE = sys.argv[1].rstrip("/"), sys.argv[2]
HERE = os.path.dirname(os.path.abspath(__file__))
IMG = os.path.join(SITE, "assets", "img")
STAGE, LIGHT, INK = "#0b0b0d", "#ffc457", "#14110a"

with open(os.path.join(HERE, "parts", "sprite.html"), encoding="utf-8") as fh:
    knight = re.search(r'<symbol id="p-N"[^>]*>(.*?)</symbol>', fh.read(), re.S).group(1)


def mark(radius, scale):
    """The knight, centred on a square of the stage colour."""
    shift = (64 - 45 * scale) / 2
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">'
            '<rect width="64" height="64" rx="%s" fill="%s"/>'
            '<g transform="translate(%.2f %.2f) scale(%s)" fill="%s" stroke="%s" stroke-width="1.2" '
            'stroke-linejoin="round" stroke-linecap="round" color="%s">%s</g></svg>'
            % (radius, STAGE, shift, shift - 0.6, scale, LIGHT, LIGHT, INK, knight))


CARD_CSS = """
body { margin: 0; width: 1200px; height: 630px; overflow: hidden; background: #08080a; }
.card-og { position: relative; width: 1200px; height: 630px; overflow: hidden; }
.og-grid { position: absolute; inset: 0; z-index: 1; display: grid; grid-template-columns: 1fr 440px; gap: 56px; align-items: center; padding: 0 72px; }
.og-copy { display: grid; gap: 26px; }
.og-brand { display: flex; align-items: center; gap: 14px; font: 500 40px/1 var(--serif); color: var(--stage-ink); }
.og-brand .brand-mark { width: 52px; height: 52px; }
.og-title { font-size: 82px; line-height: 0.98; color: var(--stage-ink); }
.og-sub { font: 400 27px/1.35 var(--sans); color: var(--stage-muted); }
.og-url { font: 400 22px/1 var(--mono); letter-spacing: 0.04em; color: var(--lumen); }
.og-board { box-shadow: 0 0 0 1px rgba(243, 240, 233, 0.14), 0 60px 130px -30px rgba(255, 196, 87, 0.42), 0 34px 70px -34px #000; }
.og-board .coord { display: none; }
"""

CARD_HTML = """
<div class="stage card-og">
  <div class="fx"><span class="fx-lamp"></span><span class="fx-lattice"></span></div>
  <div class="og-grid">
    <div class="og-copy">
      <p class="og-brand"><svg class="brand-mark" viewBox="0 0 45 45"><use href="#p-N"/></svg>Luminex</p>
      <p class="h-xl og-title">Every idea, <em>measured</em> before it plays.</p>
      <p class="og-sub">A free, open-source chess engine. NNUE evaluation, alpha-beta search, every change tested with SPRT.</p>
      <p class="og-url">luminexchess.com</p>
    </div>
    <div class="board og-board" id="og-board"></div>
  </div>
</div>
"""

os.makedirs(IMG, exist_ok=True)
with open(os.path.join(IMG, "mark.svg"), "w", encoding="utf-8", newline="\n") as fh:
    fh.write(mark(14, 1.0) + "\n")

with sync_playwright() as p:
    browser = p.chromium.launch(channel="chrome", headless=True)

    # icons: the rounded mark for browsers, a full square for home screens
    page = browser.new_page()
    def shot(svg, size):
        page.set_viewport_size({"width": size, "height": size})
        page.set_content('<body style="margin:0;background:transparent">%s</body>'
                         % svg.replace("<svg ", '<svg width="%d" height="%d" ' % (size, size), 1))
        return Image.open(io.BytesIO(page.screenshot(omit_background=True, type="png")))
    shot(mark(14, 1.0), 64).save(os.path.join(IMG, "mark-64.png"), optimize=True)
    shot(mark(0, 0.86), 180).convert("RGB").save(os.path.join(IMG, "apple-touch-icon.png"), optimize=True)
    shot(mark(0, 0.86), 192).convert("RGB").save(os.path.join(IMG, "icon-192.png"), optimize=True)
    shot(mark(0, 0.86), 512).convert("RGB").save(os.path.join(IMG, "icon-512.png"), optimize=True)
    shot(mark(14, 1.0), 256).save(os.path.join(SITE, "favicon.ico"), sizes=[(16, 16), (32, 32), (48, 48)])
    page.close()

    # the card: built inside a page of the site, so its fonts and styles are the site's own
    ctx = browser.new_context(viewport={"width": 1200, "height": 630}, bypass_csp=True, reduced_motion="reduce")
    page = ctx.new_page()
    page.goto(BASE + "/404.html", wait_until="load")
    page.add_style_tag(content=CARD_CSS)
    page.evaluate(
        """async (html) => {
            document.querySelectorAll('body > :not(.sprite)').forEach(n => n.remove());
            document.body.insertAdjacentHTML('beforeend', html);
            const games = await (await fetch('/assets/data/games.json')).json();
            const g = games[0], keys = Object.keys(g.moments).map(Number).sort((a, b) => a - b);
            const board = new Lux.Board(document.getElementById('og-board'), {});
            board.instant(function () { board.set(g.plies[keys[0]].fen, false); });
            board.mark(g.plies[keys[0]].uci, false, true);
            await document.fonts.ready;
        }""", CARD_HTML)
    page.wait_for_timeout(400)
    card = Image.open(io.BytesIO(page.screenshot(type="png"))).convert("RGB")
    card.save(os.path.join(IMG, "og.png"), optimize=True)
    browser.close()

for name in ("favicon.ico", "assets/img/mark.svg", "assets/img/mark-64.png", "assets/img/apple-touch-icon.png",
             "assets/img/icon-192.png", "assets/img/icon-512.png", "assets/img/og.png"):
    print("  %-34s %7.1f KB" % (name, os.path.getsize(os.path.join(SITE, name)) / 1024))
