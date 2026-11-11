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
The three tests-* regions are drawn from site/assets/data/tests.json.

After stamping it checks every page for what the Content Security Policy would
block (inline styles, inline scripts) and for local links that lead nowhere, and
exits with status 1 if it finds any.
"""
import html
import json
import os
import re
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


# ---------------------------------------------------------------- stamping

REGION = re.compile(r"(?P<indent>[ \t]*)<!-- @(?P<name>[\w-]+) -->.*?<!-- /@(?P=name) -->", re.S)


def stamp(text, page_url, data):
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


def main():
    root = sys.argv[1] if len(sys.argv) > 1 else "site"
    with open(os.path.join(root, "assets", "data", "tests.json"), encoding="utf-8") as fh:
        data = json.load(fh)
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
            after = stamp(before, url, data)
            if after != before:
                with open(path, "w", encoding="utf-8", newline="\n") as fh:
                    fh.write(after)
            problems = check(root, rel, after)
            print("%-22s %s%s" % (rel, "stamped" if after != before else "unchanged",
                                  "" if not problems else "  (%d problems)" % len(problems)))
            for p in problems:
                print("    - " + p)
            bad += len(problems)
    if bad:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
