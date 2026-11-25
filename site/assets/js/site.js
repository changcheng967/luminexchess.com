/* luminexchess.com: shared behaviour for every page. The pages are complete
   without this file; it adds the scroll scenes' machinery, the header, the release
   lookup and small comforts. Page scripts build on window.Lux. */
(function () {
  "use strict";

  var root = document.documentElement;
  var motion = root.classList.contains("motion");
  var finePointer = window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  function clamp(v, lo, hi) { return v < (lo || 0) ? (lo || 0) : v > (hi == null ? 1 : hi) ? (hi == null ? 1 : hi) : v; }
  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  var Lux = window.Lux = { motion: motion, clamp: clamp, $: $, $$: $$, el: el, finePointer: finePointer };

  /* ---------- scroll scenes ----------
     A scene is an element whose progress through the viewport drives its
     animation. Each frame the progress is written to the element as --p and
     handed to onUpdate. Modes:
       "pin"    a tall element with a sticky child: 0 when its top reaches the
                top of the viewport, 1 when its bottom reaches the bottom;
       "enter"  0 when its top is near the bottom of the viewport, 1 when it
                has risen to about a third of the way down;
       "view"   0 as it enters at the bottom, 1 as it leaves at the top;
       or a function (rect, viewportHeight) returning 0..1.
     smooth (0..1) eases the value toward its target each frame. */
  var scenes = [], queued = false, sceneIO = null;

  function measure(s, vh) {
    var r = s.el.getBoundingClientRect();
    if (typeof s.mode === "function") return clamp(s.mode(r, vh));
    if (s.mode === "pin") {
      var span = r.height - vh;
      return span > 1 ? clamp(-r.top / span) : (r.top <= 0 ? 1 : 0);
    }
    if (s.mode === "enter") return clamp((vh * 0.92 - r.top) / (vh * 0.6));
    return clamp((vh - r.top) / (vh + r.height));
  }
  function frame() {
    queued = false;
    var vh = window.innerHeight, again = false, i, s;
    var vals = [];
    for (i = 0; i < scenes.length; i++) {            // read everything first
      s = scenes[i];
      vals[i] = (s.active || s.p < 0) ? measure(s, vh) : null;
    }
    for (i = 0; i < scenes.length; i++) {            // then write
      if (vals[i] === null) continue;
      s = scenes[i];
      s.target = vals[i];
      var p = s.target;
      if (s.smooth && s.p >= 0) {
        p = s.p + (s.target - s.p) * s.smooth;
        if (Math.abs(s.target - p) < 0.0005) p = s.target; else again = true;
      }
      if (p !== s.p) {
        s.p = p;
        s.el.style.setProperty("--p", p.toFixed(4));
        if (s.onUpdate) s.onUpdate(p, s);
      }
    }
    if (again) request();
  }
  function request() {
    if (!queued) { queued = true; requestAnimationFrame(frame); }
  }
  Lux.scene = function (element, opts) {
    var s = { el: element, mode: "view", smooth: 0, p: -1, target: 0, active: true, onUpdate: null };
    for (var k in opts) if (Object.prototype.hasOwnProperty.call(opts, k)) s[k] = opts[k];
    scenes.push(s);
    if ("IntersectionObserver" in window) {
      if (!sceneIO) {
        sceneIO = new IntersectionObserver(function (entries) {
          entries.forEach(function (e) {
            for (var i = 0; i < scenes.length; i++) if (scenes[i].el === e.target) scenes[i].active = e.isIntersecting;
          });
          request();
        }, { rootMargin: "35% 0px 35% 0px" });
      }
      sceneIO.observe(element);
    }
    request();
    return s;
  };
  Lux.refresh = request;
  window.addEventListener("scroll", request, { passive: true });
  window.addEventListener("resize", request);

  /* run fn once, when the element first comes on screen */
  Lux.onVisible = function (element, fn, threshold) {
    if (!("IntersectionObserver" in window)) { fn(); return; }
    var io = new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) { io.disconnect(); fn(); }
    }, { threshold: threshold == null ? 0.25 : threshold });
    io.observe(element);
  };
  /* call fn(true/false) as the element enters and leaves the screen */
  Lux.whileVisible = function (element, fn, threshold) {
    if (!("IntersectionObserver" in window)) { fn(true); return; }
    new IntersectionObserver(function (entries) { fn(entries[0].isIntersecting); }, { threshold: threshold || 0 }).observe(element);
  };

  /* ---------- arriving at an anchor ----------
     A link from another page to an anchor (/#gauntlet) is followed while the page is still being
     put together. The browser scrolls to the target; then whatever takes its full size later (the
     opening's scroll track, a late font) pushes the target away again, by thousands of pixels on
     the home page. So on a fresh arrival the target is put back after every change of the page's
     height, until the page has settled or the visitor moves it themselves. Gliding between anchors
     (scroll-behavior: smooth, which the stylesheet keys on is-settled) starts only after that, so
     an arrival never flies over the whole page towards a place that is about to move. */
  (function arrival() {
    var target = null, over = false, watch = null, timer = 0, lastY = 0;
    var loaded = document.readyState === "complete", waits = 0;
    var inputs = ["wheel", "touchstart", "pointerdown", "keydown"];
    // the browser's own place for an anchor: its top below the page's scroll-padding and its scroll-margin
    function put() {
      if (over || !target) return;
      target.scrollIntoView();
      lastY = window.scrollY;
    }
    function end() {
      if (over) return;
      over = true;
      if (watch) watch.disconnect();
      clearTimeout(timer);
      inputs.forEach(function (ev) { window.removeEventListener(ev, end, true); });
      window.removeEventListener("scroll", moved);
      root.classList.add("is-settled");
    }
    // a scroll that is neither ours nor one of the browser's small corrections is the visitor's (a dragged scrollbar)
    function moved() { if (Math.abs(window.scrollY - lastY) > 48) end(); }
    // everything has loaded and no scene is still waiting for its data: a moment more for late fonts, then done
    function calm() {
      if (over || waits || !loaded) return;
      put();
      clearTimeout(timer);
      timer = setTimeout(end, 1500);
    }

    var entry = window.performance && performance.getEntriesByType ? performance.getEntriesByType("navigation")[0] : null;
    var id = "";
    try { id = decodeURIComponent((location.hash || "").slice(1)); } catch (e) { /* not an anchor */ }
    var first = id ? document.getElementById(id) : null;
    // on a reload or a step back in history the browser restores the old place by itself
    if (!first || !entry || entry.type !== "navigate") {
      end();
    } else {
      target = first;
      inputs.forEach(function (ev) { window.addEventListener(ev, end, { capture: true, passive: true }); });
      window.addEventListener("scroll", moved, { passive: true });
      if ("ResizeObserver" in window) { watch = new ResizeObserver(put); watch.observe(document.body); }
      if (!loaded) window.addEventListener("load", function () { loaded = true; calm(); });
      put();
      calm();
    }

    /* scroll to a target the page script has just made visible (a row of the record that a filter
       had hidden); on arrival it is then the one that is kept in place */
    Lux.land = function (node) {
      if (over) { node.scrollIntoView(); return; }
      target = node;
      put();
    };
    /* a scene that changes the page's height once its data has arrived asks the arrival to wait
       for it; it calls the function it gets back when that is done, or will never happen */
    Lux.wait = function () {
      var open = !over;
      if (open) waits++;
      return function () {
        if (!open) return;
        open = false;
        waits--;
        calm();
      };
    };
  })();

  /* ---------- header: leaves on the way down, returns on the way up ---------- */
  var hdr = $(".hdr"), nav = $("#nav"), toggle = $(".nav-toggle");
  var lastY = window.scrollY, run = 0;
  function navOpen() { return nav && nav.classList.contains("is-open"); }
  function setNav(open) {
    if (!nav || !toggle) return;
    nav.classList.toggle("is-open", open);
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    if (open && hdr) hdr.classList.remove("is-away");
  }
  if (hdr) {
    window.addEventListener("scroll", function () {
      var y = window.scrollY, dy = y - lastY;
      lastY = y;
      hdr.classList.toggle("is-solid", y > 12);
      if (navOpen()) return;
      if (y < 120) { hdr.classList.remove("is-away"); run = 0; return; }
      run = (dy > 0) === (run > 0) ? run + dy : dy;
      if (run > 70) hdr.classList.add("is-away");
      else if (run < -50) hdr.classList.remove("is-away");
    }, { passive: true });
    hdr.addEventListener("focusin", function () { hdr.classList.remove("is-away"); });
    hdr.classList.toggle("is-solid", window.scrollY > 12);
  }

  /* ---------- coming into the light: marked elements come up once, when first seen ---------- */
  (function rise() {
    if (motion) {
      var auto = ".sec-head, .card, .tl, .gen, .howto-step, .faq details, .trow, .spec-row, .net-layer, .gnt-row, .cci-cell, .dl-row, .rung";
      $$(auto).forEach(function (n) {
        if (n.hasAttribute("data-rise") || n.parentNode.closest("[data-rise], .stage, [data-no-rise]")) return;
        n.setAttribute("data-rise", "");
        var k = 0, s = n;
        while ((s = s.previousElementSibling)) if (s.matches(auto)) k++;
        n.style.setProperty("--d", k % 8);
      });
    }
    var nodes = $$("[data-rise], [data-focus]");
    if (!nodes.length) return;
    $$("[data-rise-group]").forEach(function (g) {
      Array.prototype.forEach.call(g.children, function (c, i) {
        if (!c.hasAttribute("data-rise")) c.setAttribute("data-rise", "");
        c.style.setProperty("--d", i);
      });
    });
    nodes = $$("[data-rise], [data-focus]");
    if (!motion || !("IntersectionObserver" in window)) { nodes.forEach(function (n) { n.classList.add("is-in"); }); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add("is-in");
        io.unobserve(e.target);
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    nodes.forEach(function (n) { io.observe(n); });
  })();
  if (toggle && nav) {
    toggle.addEventListener("click", function () { setNav(!navOpen()); });
    nav.addEventListener("click", function (e) { if (e.target.closest("a")) setNav(false); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && navOpen()) { setNav(false); toggle.focus(); }
    });
    document.addEventListener("click", function (e) {
      if (navOpen() && !e.target.closest(".hdr-pill")) setNav(false);
    });
  }

  /* ---------- odometers: a number whose digits roll when its value changes ----------
     Built only where a page script asks for one (the chart's rating as the chronicle moves). */
  function Odo(node) {
    this.el = node;
    this.text = node.textContent.trim();
    this.sr = el("span", "sr-only", this.text);
    this.vis = el("span", "odo-v");
    this.vis.setAttribute("aria-hidden", "true");
    node.textContent = "";
    node.appendChild(this.sr);
    node.appendChild(this.vis);
    node.classList.add("odo");
    this.shape = null;
    this.digits = [];
    this.build(this.text, true);
  }
  Odo.prototype.build = function (text, fromZero) {
    var vis = this.vis, digits = this.digits = [], n = 0;
    vis.textContent = "";
    for (var c = 0; c < text.length; c++) {
      var ch = text.charAt(c);
      if (ch >= "0" && ch <= "9") {
        // each window is as wide as the digit it ends on, so the number keeps
        // its natural spacing; the ribbon of 0-9 rolls behind it
        var d = el("span", "odo-d"), z = el("span", "odo-z", ch), r = el("span", "odo-r");
        for (var k = 0; k < 10; k++) r.appendChild(el("span", null, String(k)));
        r.style.setProperty("--i", n++);
        r.style.setProperty("--v", fromZero ? 0 : ch);
        d.appendChild(z);
        d.appendChild(r);
        vis.appendChild(d);
        digits.push({ r: r, z: z, v: +ch });
      } else {
        vis.appendChild(el("span", "odo-s", ch));
      }
    }
    this.shape = text.replace(/\d/g, "0");
    this.text = text;
  };
  Odo.prototype.roll = function () {
    this.digits.forEach(function (d) { d.r.style.setProperty("--v", d.v); });
  };
  // back to zero at once, then roll up again to the number shown
  Odo.prototype.replay = function () {
    var self = this;
    this.vis.classList.add("is-reset");
    this.digits.forEach(function (d) { d.r.style.setProperty("--v", 0); });
    requestAnimationFrame(function () { requestAnimationFrame(function () { self.vis.classList.remove("is-reset"); self.roll(); }); });
  };
  // show another value; digits roll when the new text has the same shape, and
  // roll up from zero when it has a new one. The copy a screen reader hears follows it.
  Odo.prototype.set = function (text) {
    this.sr.textContent = text;
    if (text === this.text) { this.roll(); return; }
    if (text.replace(/\d/g, "0") !== this.shape) {
      this.build(text, true);
      var self = this;
      requestAnimationFrame(function () { requestAnimationFrame(function () { self.roll(); }); });
      return;
    }
    var k = 0;
    for (var c = 0; c < text.length; c++) {
      var ch = text.charAt(c);
      if (ch >= "0" && ch <= "9") {
        var dg = this.digits[k++];
        dg.v = +ch;
        dg.z.textContent = ch;
        dg.r.style.setProperty("--v", ch);
      }
    }
    this.text = text;
  };
  Lux.odo = function (node) {
    if (node._odo) return node._odo;
    node._odo = new Odo(node);
    return node._odo;
  };

  /* ---------- the rail: where you are on a long page ---------- */
  (function rail() {
    var marks = $$("[data-rail]");
    if (marks.length < 3) return;
    var navEl = el("nav", "rail");
    navEl.setAttribute("aria-label", "On this page");
    var bar = el("span", "rail-bar"); bar.appendChild(el("span", "rail-fill"));
    var list = el("ol");
    var links = marks.map(function (sec) {
      var li = el("li"), a = el("a");
      a.href = "#" + sec.id;
      a.appendChild(el("span", null, sec.getAttribute("data-rail")));
      li.appendChild(a); list.appendChild(li);
      return a;
    });
    navEl.appendChild(bar); navEl.appendChild(list);
    document.body.appendChild(navEl);

    var fill = bar.firstChild, pending = false, current = -1;
    function update() {
      pending = false;
      var doc = document.documentElement, max = doc.scrollHeight - window.innerHeight;
      var p = max > 0 ? clamp(window.scrollY / max) : 0;
      fill.style.setProperty("--p", p.toFixed(4));
      var probe = window.innerHeight * 0.4, at = 0;
      for (var i = 0; i < marks.length; i++) if (marks[i].getBoundingClientRect().top <= probe) at = i;
      if (at !== current) {
        current = at;
        links.forEach(function (a, i) { if (i === at) a.setAttribute("aria-current", "true"); else a.removeAttribute("aria-current"); });
      }
      var foot = $(".ftr");
      // off above the first marked section (the home page's ride has its own steps) and over the footer
      navEl.classList.toggle("is-off", marks[0].getBoundingClientRect().top > probe ||
                                       (!!foot && foot.getBoundingClientRect().top < window.innerHeight * 0.7));
    }
    function ask() { if (!pending) { pending = true; requestAnimationFrame(update); } }
    window.addEventListener("scroll", ask, { passive: true });
    window.addEventListener("resize", ask);
    update();
  })();

  /* ---------- downloads: point at the visitor's system ---------- */
  (function recommend() {
    var plat = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || "";
    var s = (plat + " " + (navigator.userAgent || "")).toLowerCase();
    var os = null;
    if (/android|iphone|ipad|ipod/.test(s)) os = null;
    else if (s.indexOf("win") !== -1) os = "windows";
    else if (s.indexOf("mac") !== -1) os = "mac";
    else if (s.indexOf("linux") !== -1 || s.indexOf("x11") !== -1) os = "linux";
    Lux.os = os;
    if (!os) return;
    $$('[data-os="' + os + '"]').forEach(function (card) { card.classList.add("is-recommended"); });
    root.setAttribute("data-os-match", os);
  })();

  /* ---------- copy buttons ---------- */
  $$(".copy").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var pre = document.getElementById(btn.getAttribute("data-copy"));
      if (!pre || !navigator.clipboard) return;
      navigator.clipboard.writeText(pre.textContent.trim()).then(function () {
        btn.classList.add("is-done");
        var use = $("use", btn);
        if (use) use.setAttribute("href", "#i-check");
        var say = $(".copy-say", btn);
        if (say) say.textContent = "Copied";
        setTimeout(function () {
          btn.classList.remove("is-done");
          if (use) use.setAttribute("href", "#i-copy");
          if (say) say.textContent = "Copy";
        }, 1700);
      });
    });
  });

  /* ---------- releases from GitHub (the links in the page are the fallback) ---------- */
  (function releases() {
    var API = "https://api.github.com/repos/changcheng967/Luminex/releases";
    function fmtSize(bytes) {
      if (bytes >= 1048576) return Math.round(bytes / 1048576) + " MB";
      return Math.round(bytes / 1024) + " KB";
    }
    function fmtDate(iso) {
      var d = new Date(iso);
      if (isNaN(d)) return null;
      return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
    }
    function slim(rel) {
      if (!rel || !rel.tag_name) return null;
      return {
        tag_name: rel.tag_name, name: rel.name, published_at: rel.published_at, html_url: rel.html_url,
        assets: (rel.assets || []).map(function (a) {
          return { name: a.name, size: a.size, browser_download_url: a.browser_download_url };
        })
      };
    }
    // One request a page at most, kept for `ttl` ms in this tab. `pick` turns the answer into what is kept.
    function load(url, key, ttl, pick, use) {
      try {
        var cached = JSON.parse(sessionStorage.getItem(key) || "null");
        if (cached && cached.data && Date.now() - cached.at < ttl) { use(cached.data); return; }
      } catch (e) { /* storage unavailable */ }
      if (!window.fetch) return;
      var ctrl = window.AbortController ? new AbortController() : null;
      var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 6000) : 0;
      fetch(url, { headers: { Accept: "application/vnd.github+json" }, signal: ctrl ? ctrl.signal : undefined })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (json) {
          clearTimeout(timer);
          var data = json && pick(json);
          if (!data) return;
          try { sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), data: data })); } catch (e) { /* ignore */ }
          use(data);
        })
        .catch(function () { clearTimeout(timer); });
    }

    // the numbered release: names, dates, sizes and download links
    function applyStable(rel) {
      if (!rel || !rel.tag_name || !rel.assets) return;
      var tag = rel.tag_name;
      $$("[data-release-tag]").forEach(function (n) { n.textContent = tag; });
      $$("[data-if-tag]").forEach(function (n) { n.hidden = n.getAttribute("data-if-tag") !== tag; });
      $$("[data-release-name]").forEach(function (n) { n.textContent = rel.name || ("Luminex " + tag); });
      var date = fmtDate(rel.published_at);
      $$("[data-release-date]").forEach(function (n) {
        if (date) { n.textContent = date; n.setAttribute("datetime", rel.published_at.slice(0, 10)); }
      });
      $$("[data-release-url]").forEach(function (n) { if (rel.html_url) n.href = rel.html_url; });
      var byName = {};
      rel.assets.forEach(function (a) { byName[a.name] = a; });
      $$("[data-asset]").forEach(function (card) {
        var a = byName[card.getAttribute("data-asset")];
        // A file whose name changes from release to release (the network) is found by its ending instead.
        var ext = card.getAttribute("data-asset-ext");
        if (!a && ext) {
          a = rel.assets.filter(function (x) { return x.name.slice(-ext.length) === ext; })[0];
        }
        if (!a) return;
        card.href = a.browser_download_url;
        var size = $("[data-size]", card), file = $("[data-file]", card);
        if (size) size.textContent = fmtSize(a.size);
        if (file) file.textContent = a.name;
      });
      $$("[data-asset-link]").forEach(function (link) {
        var a = byName[link.getAttribute("data-asset-link")];
        if (a) link.href = a.browser_download_url;
      });
    }
    // The development build is a pre-release that every push to main replaces. Its name changes
    // with it, so the page links to the list of releases and only says which build is there now.
    function applyDev(rel) {
      var date = rel && fmtDate(rel.published_at);
      if (!rel || !rel.tag_name || !date) return;
      $$("[data-dev-name]").forEach(function (n) { n.textContent = rel.tag_name; });
      $$("[data-dev-date]").forEach(function (n) { n.textContent = date; n.setAttribute("datetime", rel.published_at.slice(0, 10)); });
      $$("[data-dev]").forEach(function (n) { n.hidden = false; });
    }

    if ($("[data-dev]")) {
      // The download page asks once for the newest few releases: the first that is not a
      // pre-release is the numbered one, the first named luminex-dev-… is the development build.
      load(API + "?per_page=6", "lux-releases-v2", 600000, function (list) {
        if (!Array.isArray(list)) return null;
        var both = { stable: null, dev: null };
        list.forEach(function (rel) {
          if (!rel || rel.draft) return;
          if (!rel.prerelease) { if (!both.stable) both.stable = slim(rel); }
          else if (!both.dev && /^luminex-dev-/.test(rel.tag_name || "")) both.dev = slim(rel);
        });
        return both.stable || both.dev ? both : null;
      }, function (both) { applyStable(both.stable); applyDev(both.dev); });
      return;
    }
    if (!$("[data-release-tag], [data-asset], [data-release-url]")) return;
    load(API + "/latest", "lux-release-v2", 3600000, slim, applyStable);
  })();

  /* ---------- the pointer: a point of light, with a ring that trails it ----------
     Mouse only. It replaces the arrow and the text I-beam, grows over anything
     that can be pressed, and over a board it becomes the outline of the square
     underneath. Without scripts, on touch screens, with reduced motion or in a
     high-contrast mode the system cursor stays. */
  (function cursor() {
    if (!motion || !finePointer) return;
    if (window.matchMedia("(forced-colors: active), (prefers-contrast: more)").matches) return;
    var wrap = el("div", "cur"), ring = el("div", "cur-ring"), dot = el("div", "cur-dot");
    wrap.setAttribute("aria-hidden", "true");
    ring.appendChild(el("i", "cur-o"));
    ring.appendChild(el("i", "cur-q"));
    dot.appendChild(el("i"));
    wrap.appendChild(ring); wrap.appendChild(dot);
    document.body.appendChild(wrap);

    var RING = 40, PRESS = "a, button, summary, label, [role='button'], .sbar, .c-pt, [data-press]";
    var x = -100, y = -100, rx = -100, ry = -100, s = 1, rs = 1, tx = 0, ty = 0;
    var on = false, raf = 0, snapped = false, lastTarget = null;

    function paint() {
      raf = 0;
      // the dot is the pointer itself; the ring eases after it, or onto a square
      var gx = snapped ? tx : x, gy = snapped ? ty : y;
      rx += (gx - rx) * 0.24; ry += (gy - ry) * 0.24; rs += (s - rs) * 0.2;
      dot.style.setProperty("--x", x.toFixed(1) + "px");
      dot.style.setProperty("--y", y.toFixed(1) + "px");
      ring.style.setProperty("--x", rx.toFixed(1) + "px");
      ring.style.setProperty("--y", ry.toFixed(1) + "px");
      ring.style.setProperty("--s", rs.toFixed(3));
      if (Math.abs(gx - rx) + Math.abs(gy - ry) > 0.2 || Math.abs(s - rs) > 0.004) raf = requestAnimationFrame(paint);
    }
    function ask() { if (!raf) raf = requestAnimationFrame(paint); }
    function show() {
      if (on) return;
      on = true; rx = x; ry = y;
      root.classList.add("has-cursor");
      wrap.classList.add("is-on");
    }
    function hide() {
      if (!on) return;
      on = false;
      wrap.classList.remove("is-on");
    }
    function read(target) {
      var board = target && target.closest ? target.closest(".board") : null;
      if (board) {
        var r = board.getBoundingClientRect(), sq = r.width / 8;
        var f = Math.min(7, Math.max(0, Math.floor((x - r.left) / sq))), k = Math.min(7, Math.max(0, Math.floor((y - r.top) / sq)));
        tx = r.left + (f + 0.5) * sq; ty = r.top + (k + 0.5) * sq;
        s = sq / RING; snapped = true;
        wrap.classList.add("is-square"); wrap.classList.remove("is-press");
        return;
      }
      snapped = false;
      wrap.classList.remove("is-square");
      var press = target && target.closest ? target.closest(PRESS) : null;
      if (press && press.disabled) press = null;
      wrap.classList.toggle("is-press", !!press);
      s = press ? 1.6 : 1;
    }
    document.addEventListener("pointermove", function (e) {
      if (e.pointerType && e.pointerType !== "mouse") { hide(); root.classList.remove("has-cursor"); return; }
      x = e.clientX; y = e.clientY;
      show();
      lastTarget = e.target;
      read(lastTarget);
      ask();
    }, { passive: true });
    // the page moves under a still pointer when it scrolls
    window.addEventListener("scroll", function () {
      if (!on) return;
      var under = document.elementFromPoint(x, y);
      if (under) { lastTarget = under; read(under); ask(); }
    }, { passive: true });
    Lux.pointerAway = function (away) { wrap.classList.toggle("is-loupe", !!away); };
    document.addEventListener("pointerdown", function () { wrap.classList.add("is-down"); });
    document.addEventListener("pointerup", function () { wrap.classList.remove("is-down"); });
    document.documentElement.addEventListener("pointerleave", hide);
    window.addEventListener("blur", hide);

    // keep the pointer where it was across a page change, so it never blinks back to the arrow
    try {
      var saved = JSON.parse(sessionStorage.getItem("lux-cur") || "null");
      if (saved && Date.now() - saved.t < 4000) { x = saved.x; y = saved.y; show(); ask(); }
      sessionStorage.removeItem("lux-cur");
      window.addEventListener("pagehide", function () {
        if (on) sessionStorage.setItem("lux-cur", JSON.stringify({ x: x, y: y, t: Date.now() }));
      });
    } catch (e) { /* storage unavailable */ }
  })();

  /* ---------- the motion switch in the footer ---------- */
  (function motionSwitch() {
    var btn = $("[data-motion-switch]");
    if (!btn) return;
    var system = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    btn.hidden = false;
    btn.setAttribute("aria-pressed", motion ? "false" : "true");
    if (system) {             // the system setting already asks for it
      btn.disabled = true;
      btn.title = "Your system asks for reduced motion";
      return;
    }
    btn.addEventListener("click", function () {
      try { localStorage.setItem("lux-motion", motion ? "off" : "on"); } catch (e) { return; }
      location.reload();
    });
  })();

  /* ---------- the whole site in motion ----------
     Headings rise word by word as their section comes into the light; a card holds a light that
     follows the pointer; a button leans toward it; a line of light at the top tracks the reading.
     Nothing here hides content without motion: every starting state is keyed on html.motion. */
  (function alive() {
    if (!motion) return;
    $$(".h-xl, .h-l").forEach(function (h) {
      if (h.closest("[data-no-words]")) return;
      var i = 0;
      Array.prototype.slice.call(h.childNodes).forEach(function (c) {
        if (c.nodeType === 3) {
          var frag = document.createDocumentFragment();
          c.textContent.split(/(\s+)/).forEach(function (t) {
            if (!t) return;
            if (/^\s+$/.test(t)) { frag.appendChild(document.createTextNode(t)); return; }
            var w = document.createElement("span");
            w.className = "w"; w.textContent = t; w.style.setProperty("--i", i++);
            frag.appendChild(w);
          });
          h.replaceChild(frag, c);
        } else if (c.nodeType === 1) {
          var box = document.createElement("span");
          box.className = "w"; box.style.setProperty("--i", i++);
          h.insertBefore(box, c); box.appendChild(c);
        }
      });
      h.classList.add("is-words");
      if (!h.closest("[data-rise]")) h.classList.add("is-auto");
    });

    var lit = null, raf = 0, px = 0, py = 0;
    document.addEventListener("pointermove", function (e) {
      px = e.clientX; py = e.clientY;
      if (raf) return;
      raf = requestAnimationFrame(function () {
        raf = 0;
        var under = document.elementFromPoint(px, py), card = under && under.closest(".card");
        if (lit && lit !== card) lit.classList.remove("is-near");
        lit = card;
        if (!card) return;
        var r = card.getBoundingClientRect();
        card.style.setProperty("--mx", Math.round(px - r.left) + "px");
        card.style.setProperty("--my", Math.round(py - r.top) + "px");
        card.classList.add("is-near");
      });
    }, { passive: true });

    $$(".btn").forEach(function (b) {
      b.addEventListener("pointermove", function (e) {
        var r = b.getBoundingClientRect();
        b.style.setProperty("--tx", (((e.clientX - r.left) / r.width - 0.5) * 10).toFixed(1) + "px");
        b.style.setProperty("--ty", (((e.clientY - r.top) / r.height - 0.5) * 8).toFixed(1) + "px");
      });
      b.addEventListener("pointerleave", function () { b.style.setProperty("--tx", "0px"); b.style.setProperty("--ty", "0px"); });
    });

    var line = document.createElement("i"), sraf = 0;
    line.className = "read-line";
    line.setAttribute("aria-hidden", "true");
    document.body.appendChild(line);
    function progress() {
      sraf = 0;
      var max = document.documentElement.scrollHeight - window.innerHeight;
      line.style.setProperty("--p", max > 0 ? Math.min(1, window.scrollY / max).toFixed(4) : 0);
    }
    window.addEventListener("scroll", function () { if (!sraf) sraf = requestAnimationFrame(progress); }, { passive: true });
    progress();
  })();

  /* ---------- fewer words at first sight ----------
     A long note, caption or card text opens with its first sentence; the rest unfolds when asked.
     Nothing is cut: the whole text is in the page, and without scripts it is all shown. */
  (function fold() {
    var sel = ".note, .fig-sub, .prose > p, .tl-body > p, .gnt-text > p, .lineage-cap, .cs-more, .clock-step > p, " +
              ".step > p, .gen > p:not([class]), .devbuild-text > p, .think-cap, .spec dd, .preview-head > p";
    var n = 0;
    $$(sel).forEach(function (p) {
      var text = p.textContent;
      if (text.length < 240 || p.closest("[data-no-fold]")) return;
      var m = /[.:;!?]\s+(?=[A-Z0-9“(+−])/g, cut = -1, r;
      while ((r = m.exec(text))) { if (r.index > 50) { cut = r.index + 1; break; } }
      if (cut < 0 || text.length - cut < 80) return;
      // the cut must fall in a text node of the paragraph itself, not inside a link or a span
      var seen = 0, at = null, off = 0;
      for (var i = 0; i < p.childNodes.length; i++) {
        var c = p.childNodes[i], len = c.textContent.length;
        if (seen + len >= cut) { if (c.nodeType === 3) { at = c; off = cut - seen; } break; }
        seen += len;
      }
      if (!at) return;
      var rest = document.createElement("span");
      rest.className = "fold-rest"; rest.id = "fold-" + (++n); rest.hidden = true;
      var tail = at.splitText(off);
      while (tail) { var next = tail.nextSibling; rest.appendChild(tail); tail = next; }
      var btn = document.createElement("button");
      btn.type = "button"; btn.className = "fold-btn";
      btn.setAttribute("aria-expanded", "false"); btn.setAttribute("aria-controls", rest.id);
      btn.textContent = "more";
      btn.addEventListener("click", function () {
        var open = rest.hidden;
        rest.hidden = !open;
        btn.setAttribute("aria-expanded", open ? "true" : "false");
        btn.textContent = open ? "less" : "more";
        p.classList.toggle("is-open", open);
      });
      p.appendChild(rest);
      p.appendChild(btn);
      p.classList.add("is-folded");
    });
  })();

  root.classList.add("is-ready");
})();
