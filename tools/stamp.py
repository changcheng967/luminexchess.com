"""Stamp the shared parts into every page of the site, and check the pages.

    python -I tools/stamp.py site

The site has no build step: every file under site/ is served as it is. This tool
only keeps the parts that repeat in step. A page marks a region with a pair of
comments and the tool rewrites what is between them:

    <!-- @header -->  ...  <!-- /@header -->

Regions:
    sprite, header, footer   from tools/parts/*.html (the header marks the
                             current page's link with aria-current)
    pieces                   the 32 pieces of the starting position
    tests-strip              the small "every test" chart on the home page
    tests-filters            the filter buttons on the tests page, with counts
    tests-rows               the full test record on the tests page
    gauntlet                 the gauntlet figure on the home page: the rating, how
                             it was measured, and a row for every opponent
The three tests-* regions are drawn from site/assets/data/tests.json, the gauntlet
from site/assets/data/gauntlet.json (written by tools/bench_update.py --gauntlet N).

After stamping it checks every page for what the Content Security Policy would
block (inline styles, inline scripts) and for local links that lead nowhere, and
exits with status 1 if it finds any. It also keeps sitemap.xml's dates in step:
a page that differs from the last commit is dated today, any other page by the
commit that last touched it.
"""
import datetime
import html
import json
import math
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PARTS = os.path.join(HERE, "parts")
BENCH = "https://bench.luminexchess.com/test/%d/"

STATUS = {                      # status -> (icon, word used in the filter)
    "pass": ("i-check", "Passed"),
    "fail": ("i-cross", "Failed"),
    "merged": ("i-merge", "Merged anyway"),
    "stop": ("i-stop", "Stopped"),
}


def esc(s):
    return html.escape(str(s), quote=True)


def num(v):
    """A coordinate without trailing zeros."""
    return ("%.2f" % v).rstrip("0").rstrip(".")


# ---------------------------------------------------------------- regions

def region_part(name):
    with open(os.path.join(PARTS, name + ".html"), encoding="utf-8") as fh:
        return fh.read().rstrip("\n")


def region_header(page_url):
    text = region_part("header")
    # the link to the page being stamped is the current one
    return text.replace('<a href="%s">' % page_url, '<a href="%s" aria-current="page">' % page_url)


def region_pieces(indent):
    back = "RNBQKBNR"
    rows = []
    for x, p in enumerate(back):
        rows.append(("b", p, x, 0))
    for x in range(8):
        rows.append(("b", "P", x, 1))
    for x in range(8):
        rows.append(("w", "P", x, 6))
    for x, p in enumerate(back):
        rows.append(("w", p, x, 7))
    out = []
    for colour, p, x, y in rows:
        sq = "abcdefgh"[x] + str(8 - y)
        out.append('%s<svg class="pc %s x%d y%d" data-p="%s%s" data-sq="%s" viewBox="0 0 45 45" aria-hidden="true" focusable="false"><use href="#p-%s"/></svg>'
                   % (indent, colour, x, y, colour, p, sq, p))
    return "\n".join(out)


def bar_path(x, w, y0, y1, r=4.0):
    """A bar from the baseline y0 to the value y1: round at the value, square at the baseline."""
    r = min(r, abs(y1 - y0), w / 2)
    s = 1 if y1 < y0 else -1          # +1: the bar rises
    return "M%s %sV%sQ%s %s %s %sH%sQ%s %s %s %sV%sZ" % (
        num(x), num(y0), num(y1 + s * r), num(x), num(y1), num(x + r), num(y1),
        num(x + w - r), num(x + w), num(y1), num(x + w), num(y1 + s * r), num(y0))


def region_tests_strip(data, indent):
    tests = sorted(data["tests"], key=lambda t: t["test"])
    lo, hi = data["axis"]["min"], data["axis"]["max"]
    W, H, L, R, T, B = 1000, 250, 44, 8, 14, 34
    ph = H - T - B
    slot = (W - L - R) / len(tests)
    bw = min(13.0, slot - 8)

    def y(v):
        return T + (hi - max(lo, min(hi, v))) * ph / (hi - lo)

    o = []
    a = o.append
    a('<div class="strip-scroll">')
    a('  <svg class="strip-svg" viewBox="0 0 %d %d" role="group" aria-label="Every SPRT, oldest first. Each bar links to its row in the full record.">' % (W, H))
    a('    <g class="strip-grid" aria-hidden="true">')
    for v in range(lo, hi + 1, 40):
        cls = ' class="is-zero"' if v == 0 else ""
        a('      <line%s x1="%d" x2="%d" y1="%s" y2="%s"/>' % (cls, L, W - R, num(y(v)), num(y(v))))
        label = "0" if v == 0 else ("+%d" % v if v > 0 else "−%d" % -v)
        a('      <text x="%d" y="%s" text-anchor="end">%s</text>' % (L - 10, num(y(v) + 4), label))
    a('      <text class="strip-end" x="%d" y="%d">Test %d</text>' % (L, H - 8, tests[0]["test"]))
    a('      <text class="strip-end" x="%d" y="%d" text-anchor="end">Test %d</text>' % (W - R, H - 8, tests[-1]["test"]))
    a("    </g>")
    for i, t in enumerate(tests):
        cx = L + slot * (i + 0.5)
        x0 = cx - bw / 2
        top, bot = t["elo"] + t["ci"], t["elo"] - t["ci"]
        label = "Test %d, %s: %s Elo over %s games. %s." % (
            t["test"], t["title"], t["text"], "{:,}".format(t["games"]), t["label"])
        a('    <a class="sbar is-%s%s" href="/tests/#t%d" aria-label="%s" data-test="%d" data-title="%s" data-text="%s" data-games="%s" data-label="%s">'
          % (t["status"], " is-neg" if t["elo"] < 0 else "", t["test"], esc(label), t["test"], esc(t["title"]), esc(t["text"]), "{:,}".format(t["games"]), esc(t["label"])))
        a('      <rect class="sbar-hit" x="%s" y="%d" width="%s" height="%d"/>' % (num(cx - slot / 2), T, num(slot), ph))
        a('      <line class="sbar-ci" x1="%s" x2="%s" y1="%s" y2="%s"/>' % (num(cx), num(cx), num(y(top)), num(y(bot))))
        if top > hi:      # the interval runs off the chart
            a('      <path class="sbar-off" d="M%s %sL%s %sL%s %s"/>' % (num(cx - 4), num(T + 6), num(cx), num(T), num(cx + 4), num(T + 6)))
        a('      <path class="sbar-fill" d="%s"/>' % bar_path(x0, bw, y(0), y(t["elo"])))
        a("    </a>")
    a("  </svg>")
    a("</div>")
    a('<p class="strip-legend"><span><i class="k-pass"></i>Passed</span><span><i class="k-rest"></i>Failed, stopped, or merged anyway</span><span><i class="k-ci"></i>95% confidence interval</span></p>')
    return "\n".join(indent + line for line in o)


def region_tests_filters(data, indent):
    tests = data["tests"]
    o = ['<button type="button" class="chip" data-filter="all" aria-pressed="true">All <span class="num">%d</span></button>' % len(tests)]
    for key in ("pass", "fail", "merged", "stop"):
        n = sum(1 for t in tests if t["status"] == key)
        if n:
            o.append('<button type="button" class="chip" data-filter="%s" aria-pressed="false">%s <span class="num">%d</span></button>'
                     % (key, STATUS[key][1], n))
    return "\n".join(indent + line for line in o)


def region_tests_rows(data, indent):
    tests = sorted(data["tests"], key=lambda t: -t["test"])
    lo, hi = data["axis"]["min"], data["axis"]["max"]
    W, H = 340, 28

    def x(v):
        return (max(lo, min(hi, v)) - lo) * W / (hi - lo)

    o = []
    a = o.append
    for t in tests:
        icon = STATUS[t["status"]][0]
        top, bot = t["elo"] + t["ci"], t["elo"] - t["ci"]
        cls = "trow is-%s" % t["status"]
        if top > hi:
            cls += " is-clip"
        a('<li class="%s" id="t%d" data-status="%s">' % (cls, t["test"], t["status"]))
        a('  <div class="trow-label">')
        a('    <a class="trow-title" href="%s">%s</a>' % (esc(t["href"]), esc(t["title"])))
        a('    <p class="trow-meta"><a href="%s">Test %d</a> · %s · %s games</p>' % (BENCH % t["test"], t["test"], esc(t["ref"]), "{:,}".format(t["games"])))
        a("  </div>")
        a('  <svg class="trow-plot" viewBox="0 0 %d %d" preserveAspectRatio="none" aria-hidden="true" focusable="false">' % (W, H))
        for v in range(lo, hi + 1, 40):
            a('    <line class="tp-grid%s" x1="%s" x2="%s" y1="0" y2="%d"/>' % (" is-zero" if v == 0 else "", num(x(v)), num(x(v)), H))
        a('    <g class="tp-mark">')
        a('      <line class="tp-ci" x1="%s" x2="%s" y1="%d" y2="%d"/>' % (num(x(bot)), num(x(top)), H // 2, H // 2))
        if t["elo"] <= hi:
            a('      <path class="tp-dot" d="M%s %dh.01"/>' % (num(x(t["elo"])), H // 2))
        if top > hi:
            a('      <path class="tp-off" d="M%d %dL%d %dL%d %d"/>' % (W - 7, H // 2 - 5, W - 1, H // 2, W - 7, H // 2 + 5))
        a("    </g>")
        a("  </svg>")
        a('  <p class="trow-value num">%s</p>' % esc(t["text"]))
        a('  <p class="trow-status st-%s"><svg class="icon" aria-hidden="true"><use href="#%s"/></svg><span>%s</span></p>' % (t["status"], icon, esc(t["label"])))
        a("</li>")
    return "\n".join(indent + line for line in o)


WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve",
         "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"]


def region_gauntlet(g, indent):
    """The gauntlet figure: the rating, how it was measured, and one row an opponent.

    Each row ends in a small plot on one shared scale: the rating that this opponent's
    games alone imply, with its interval, over the band of the fitted rating. Luminex's
    own row stands where its rating puts it among the opponents.
    """
    ops = sorted(g["opponents"], key=lambda o: -o["rating"])
    n = len(ops)
    count = WORDS[n] if n < len(WORDS) else str(n)
    lo = min([o["implied"] - o["impliedError"] for o in ops] + [g["rating"] - g["error"]])
    hi = max([o["implied"] + o["impliedError"] for o in ops] + [g["rating"] + g["error"]])
    lo, hi = math.floor((lo - 6) / 10) * 10, math.ceil((hi + 6) / 10) * 10
    W, H = 200, 20

    def x(v):
        return (v - lo) / (hi - lo) * W

    band = ('<rect class="gf-band" x="%s" width="%s" height="%d"/><line class="gf-fit" x1="%s" x2="%s" y2="%d"/>'
            % (num(x(g["rating"] - g["error"])), num(x(g["rating"] + g["error"]) - x(g["rating"] - g["error"])), H,
               num(x(g["rating"])), num(x(g["rating"])), H))

    def forest(value, err, pooled=False):
        mark = ('<path class="gf-pool" d="M%s %dL%s %dL%s %dL%s %dZ"/>' % (num(x(value) - 5.5), H // 2, num(x(value)), H // 2 - 6,
                                                                               num(x(value) + 5.5), H // 2, num(x(value)), H // 2 + 6)
                if pooled else '<circle class="gf-dot" cx="%s" cy="%d" r="4.5"/>' % (num(x(value)), H // 2))
        return ('<svg class="gnt-forest" viewBox="0 0 %d %d" aria-hidden="true" focusable="false">%s'
                '<line class="gf-whisk" x1="%s" x2="%s" y1="%d" y2="%d"/>%s</svg>'
                % (W, H, band, num(x(value - err)), num(x(value + err)), H // 2, H // 2, mark))

    def wdl(o):
        return ('<svg class="wdl" viewBox="0 0 %d 10" preserveAspectRatio="none" aria-hidden="true" focusable="false">'
                '<rect class="wdl-w" x="0" width="%d" height="10"/><rect class="wdl-d" x="%d" width="%d" height="10"/>'
                '<rect class="wdl-l" x="%d" width="%d" height="10"/></svg>' % (o["games"], o["w"], o["w"], o["d"], o["w"] + o["d"], o["l"]))

    def pct(v):
        return ("%.1f" % v).rstrip("0").rstrip(".") + "%"

    ticks = "".join('<text x="%s" y="10" text-anchor="middle">%d</text>' % (num(x(v)), v)
                    for v in range(int(math.ceil(lo / 50.0)) * 50, hi + 1, 50))
    rows, placed = [], False
    for o in ops:
        if not placed and o["rating"] < g["rating"]:
            placed = True
            rows.append(
                '  <li class="gnt-row is-lum">\n'
                '    <span class="gnt-name">Luminex <span class="gnt-rating num">%d ± %d</span></span>\n'
                '    <span class="gnt-result"><span class="gnt-games">The rating that fits all %s</span></span>\n'
                '    <span class="gnt-score"></span>\n'
                '    %s\n'
                '    <span class="gnt-implied num">%d <span class="gnt-err">± %d</span></span>\n'
                '  </li>' % (g["rating"], g["error"], count, forest(g["rating"], g["error"], True), g["rating"], g["error"]))
            under = " is-under"
        else:
            under = ""
        # each opponent's name leads to its match on the bench
        name = ('<a href="%s">%s</a>' % (BENCH % o["test"], esc(o["name"]))) if o.get("test") else esc(o["name"])
        rows.append(
            '  <li class="gnt-row%s">\n'
            '    <span class="gnt-name">%s <span class="gnt-rating num">%d</span></span>\n'
            '    <span class="gnt-result">\n'
            '      %s\n'
            '      <span class="gnt-games">+%d =%d −%d<span class="gnt-n"> · %d games</span></span>\n'
            '    </span>\n'
            '    <span class="gnt-score num">%s</span>\n'
            '    %s\n'
            '    <span class="gnt-implied num"><span class="gnt-says">implies </span>%d <span class="gnt-err">± %d</span></span>\n'
            '  </li>' % (under, name, o["rating"], wdl(o), o["w"], o["d"], o["l"], o["games"], pct(o["score"]),
                         forest(o["implied"], o["impliedError"]), o["implied"], o["impliedError"]))
    implied = [o["implied"] for o in ops]
    other = next((l for l in g["lists"] if l["list"] != g["list"] and l["list"].startswith("CCRL")), None)
    clean = ", none lost on time and no crash" if not g.get("lostOnTimeOrCrashed") else ""
    day = re.sub(r" \d{4}$", "", g["date"])
    out = [
        '<figcaption class="gnt-head">',
        '  <div class="gnt-score-box">',
        '    <p class="fact-label" id="gauntlet-title">The development build, against %s engines</p>' % count,
        '    <p class="gnt-num num"><span data-odo>%d</span><span class="gnt-pm">± %d</span></p>' % (g["rating"], g["error"]),
        '    <p class="gnt-on">on the %s scale</p>' % esc(g["list"]),
    ] + ([
        '    <p class="gnt-also"><span class="num">%d ± %d</span> on the %s scale, from the same games</p>' % (other["rating"], other["error"], esc(other["list"])),
    ] if other else []) + [
        '  </div>',
        '  <div class="gnt-text">',
        '    <p>Main of %s, with the %s network, played %d games against each of %s engines that CCRL rates, at %s on one thread: '
        '%s games%s. The rating is the one at which the points expected against all %s equal the points scored.</p>'
        % (day, esc(g["network"]), g["each"], count, esc(g["tc"]), "{:,}".format(g["games"]), clean, count),
        '    <p>The ± is mostly the opponents disagreeing: taken alone, each implies a rating between %d and %d, '
        'where the games by themselves would leave ± %d. More opponents near Luminex would narrow it; more games would not.</p>'
        % (min(implied), max(implied), g["fromGames"]),
        '    <a class="link" href="%s"><span>Gauntlet %d on OpenBench</span><svg class="icon" aria-hidden="true"><use href="#i-arrow"/></svg></a>'
        % (esc(g["href"]), g["id"]),
        '  </div>',
        '</figcaption>',
        '<p class="legend gnt-legend"><span><i class="k-w"></i>Luminex wins</span><span><i class="k-d"></i>Draws</span>'
        '<span><i class="k-l"></i>Opponent wins</span><span><i class="k-dot"></i>The rating one opponent\'s games imply, with its 95% interval</span>'
        '<span><i class="k-band"></i>The fitted rating and its interval</span></p>',
        '<div class="gnt-cols" aria-hidden="true"><span>Opponent · %s</span><span>Results for Luminex</span><span>Score</span>'
        '<svg class="gnt-axis" viewBox="0 0 %d 14" focusable="false">%s</svg><span>Implies</span></div>' % (esc(g["list"]), W, ticks),
        '<ol class="gnt-rows" aria-label="Results against %s rated engines, strongest first, with Luminex where its rating puts it">' % count,
    ] + rows + [
        '</ol>',
        '<p class="note gnt-note">Opponent ratings are %s values for one CPU. The gaps in these games are wider than the list\'s: '
        'one Elo point here is worth %s points of the list, which the fit measures from the same games. '
        'The release was not in this gauntlet; its estimate comes from the Stash ladder above.</p>'
        % (esc(g["list"]), ("%.2f" % g["scale"]).rstrip("0").rstrip(".")),
    ]
    return "\n".join(indent + "  " + line for chunk in out for line in chunk.split("\n"))


# ---------------------------------------------------------------- stamping

REGION = re.compile(r"(?P<indent>[ \t]*)<!-- @(?P<name>[\w-]+) -->.*?<!-- /@(?P=name) -->", re.S)


def stamp(text, page_url, data, gauntlet=None):
    def fill(m):
        name, indent = m.group("name"), m.group("indent")
        if name in ("sprite", "footer"):
            body = region_part(name)
        elif name == "header":
            body = region_header(page_url)
        elif name == "pieces":
            body = region_pieces(indent)
        elif name == "tests-strip":
            body = region_tests_strip(data, indent)
        elif name == "tests-filters":
            body = region_tests_filters(data, indent)
        elif name == "tests-rows":
            body = region_tests_rows(data, indent)
        elif name == "gauntlet":
            if gauntlet is None:
                raise SystemExit("@gauntlet in %s, but assets/data/gauntlet.json is missing" % page_url)
            body = region_gauntlet(gauntlet, indent)
        else:
            raise SystemExit("unknown region @%s in %s" % (name, page_url))
        return "%s<!-- @%s -->\n%s\n%s<!-- /@%s -->" % (indent, name, body, indent, name)
    return REGION.sub(fill, text)


# ---------------------------------------------------------------- checks

def check(root, rel, text):
    problems = []
    if re.search(r"<style[\s>]", text):
        problems.append("a <style> element (the CSP blocks inline styles)")
    for m in re.finditer(r"<[a-zA-Z][^>]*\sstyle\s*=", text):
        problems.append("a style= attribute near: " + m.group(0)[:70])
    for m in re.finditer(r"<script\b([^>]*)>", text):
        attrs = m.group(1)
        if "src=" not in attrs and "application/ld+json" not in attrs:
            problems.append("an inline <script> (the CSP blocks it)")
    for m in re.finditer(r"\son[a-z]+\s*=\s*[\"']", text):
        problems.append("an inline event handler: " + m.group(0).strip())
    for m in re.finditer(r'(?:href|src)="(/[^"#?]*)(?:[?#][^"]*)?"', text):
        target = m.group(1)
        path = os.path.join(root, target.lstrip("/").replace("/", os.sep))
        if target.endswith("/"):
            path = os.path.join(path, "index.html")
        if not os.path.exists(path):
            problems.append("a link to a missing file: " + target)
    ids = re.findall(r'\sid="([^"]+)"', text)
    for dup in sorted({i for i in ids if ids.count(i) > 1}):
        problems.append('id="%s" is used more than once' % dup)
    for m in re.finditer(r'href="#([^"]+)"', text):
        if m.group(1) not in ids:
            problems.append("a link to #%s, which is not on the page" % m.group(1))
    for m in re.finditer(r'href="(/[^"#?]*)#([^"]+)"', text):          # anchors on other pages
        target = os.path.join(root, m.group(1).lstrip("/").replace("/", os.sep))
        if m.group(1).endswith("/"):
            target = os.path.join(target, "index.html")
        if os.path.exists(target):
            with open(target, encoding="utf-8") as fh:
                other = fh.read()
            if not re.search(r'\sid="%s"' % re.escape(m.group(2)), other) and not m.group(2).startswith("t"):
                problems.append("a link to %s#%s, which is not on that page" % (m.group(1), m.group(2)))
    seen, unique = set(), []
    for p in problems:
        if p not in seen:
            seen.add(p)
            unique.append(p)
    return unique


def sitemap_dates(root):
    """Set each page's <lastmod> in sitemap.xml: today if the page differs from the last commit, else that commit's date.

    Needs git; without it (or outside a checkout) the sitemap is left alone. Returns a word for the report.
    """
    path = os.path.join(root, "sitemap.xml")
    if not os.path.exists(path):
        return None

    def git(*args):
        try:
            done = subprocess.run(["git", "-C", root] + list(args), capture_output=True, text=True, timeout=30)
        except (OSError, subprocess.SubprocessError):
            return None
        return done.stdout.strip() if done.returncode == 0 else None

    if git("rev-parse", "--is-inside-work-tree") != "true":
        return None
    with open(path, encoding="utf-8") as fh:
        before = fh.read()

    def date(m):
        rel = m.group(1).split("/", 3)[3] if m.group(1).count("/") >= 3 else ""      # the path after https://host/
        rel = rel + "index.html" if rel == "" or rel.endswith("/") else rel
        day = datetime.date.today().isoformat() if git("status", "--porcelain", "--", rel) else git("log", "-1", "--format=%cs", "--", rel)
        return m.group(0) if not day else "<loc>%s</loc>%s<lastmod>%s</lastmod>" % (m.group(1), m.group(2), day)

    after = re.sub(r"<loc>([^<]+)</loc>(\s*)<lastmod>[^<]*</lastmod>", date, before)
    if after != before:
        with open(path, "w", encoding="utf-8", newline="\n") as fh:
            fh.write(after)
    return "stamped" if after != before else "unchanged"


def main():
    root = sys.argv[1] if len(sys.argv) > 1 else "site"
    with open(os.path.join(root, "assets", "data", "tests.json"), encoding="utf-8") as fh:
        data = json.load(fh)
    gauntlet = None
    if os.path.exists(os.path.join(root, "assets", "data", "gauntlet.json")):
        with open(os.path.join(root, "assets", "data", "gauntlet.json"), encoding="utf-8") as fh:
            gauntlet = json.load(fh)
    bad = 0
    for folder, _, files in os.walk(root):
        for name in sorted(files):
            if not name.endswith(".html"):
                continue
            path = os.path.join(folder, name)
            rel = os.path.relpath(path, root).replace(os.sep, "/")
            url = "/" + (rel[:-len("index.html")] if rel.endswith("index.html") else rel)
            with open(path, encoding="utf-8") as fh:
                before = fh.read()
            after = stamp(before, url, data, gauntlet)
            if after != before:
                with open(path, "w", encoding="utf-8", newline="\n") as fh:
                    fh.write(after)
            problems = check(root, rel, after)
            print("%-22s %s%s" % (rel, "stamped" if after != before else "unchanged",
                                  "" if not problems else "  (%d problems)" % len(problems)))
            for p in problems:
                print("    - " + p)
            bad += len(problems)
    dates = sitemap_dates(root)
    if dates:
        print("%-22s %s" % ("sitemap.xml", dates))
    if bad:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
