/* luminexchess.com: shared behaviour for every page. The pages are complete
   without this file; it adds motion, the release lookup and small comforts.
   Page scripts build on window.Lux. */
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
      if (navOpen()) return;
      if (y < 120) { hdr.classList.remove("is-away"); run = 0; return; }
      run = (dy > 0) === (run > 0) ? run + dy : dy;
      if (run > 70) hdr.classList.add("is-away");
      else if (run < -50) hdr.classList.remove("is-away");
    }, { passive: true });
    hdr.addEventListener("focusin", function () { hdr.classList.remove("is-away"); });
  }
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

  /* ---------- headings: split into words that rise one after another ---------- */
  function split(heading) {
    var text = heading.textContent.replace(/\s+/g, " ").trim();
    var live = el("span");
    live.setAttribute("aria-hidden", "true");
    while (heading.firstChild) live.appendChild(heading.firstChild);
    var i = 0;
    (function walk(node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (child) {
        if (child.nodeType === 3) {
          var frag = document.createDocumentFragment();
          child.textContent.split(/(\s+)/).forEach(function (part) {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(" ")); return; }
            var w = el("span", "w"), inner = el("span", null, part);
            w.style.setProperty("--i", i++);
            w.appendChild(inner);
            frag.appendChild(w);
          });
          node.replaceChild(frag, child);
        } else if (child.nodeType === 1 && child.tagName !== "BR") {
          walk(child);
        }
      });
    })(live);
    heading.appendChild(el("span", "sr-only", text));   // what assistive technology reads
    heading.appendChild(live);
    heading.classList.add("is-split");
  }

  /* ---------- odometers: numbers whose digits roll into place ---------- */
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
  // show another value; digits roll when the new text has the same shape, and
  // roll up from zero when it has a new one
  Odo.prototype.set = function (text) {
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

  /* ---------- reveal on scroll ---------- */
  if (motion) {
    $$("[data-split]").forEach(split);
    var odos = $$("[data-odo]").map(function (n) { return Lux.odo(n); });
    if ("IntersectionObserver" in window) {
      var arrive = function (node) {
        node.classList.add("is-in");
        if (node._odo && !node.hasAttribute("data-odo-manual")) node._odo.roll();
        if (node.hasAttribute("data-reveal")) {
          var wait = 1300 + 80 * (parseInt(node.getAttribute("data-d"), 10) || 0);
          setTimeout(function () { node.classList.add("is-done"); }, wait);
        }
      };
      var revealIO = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (!e.isIntersecting) return;
          revealIO.unobserve(e.target);
          arrive(e.target);
        });
      }, { threshold: 0.14, rootMargin: "0px 0px -7% 0px" });
      // what is already on the first screen arrives at once, even at its very
      // bottom edge, where the observer's margin would never reach it
      var firstScreen = window.innerHeight + 30;
      $$("[data-reveal], [data-split], [data-odo]").forEach(function (n) {
        var r = n.getBoundingClientRect();
        if (r.bottom > 0 && r.top < firstScreen) requestAnimationFrame(function () { arrive(n); });
        else revealIO.observe(n);
      });
    } else {
      $$("[data-reveal], [data-split]").forEach(function (n) { n.classList.add("is-in", "is-done"); });
      odos.forEach(function (o) { o.roll(); });
    }
  }

  /* ---------- the checkered dissolve ---------- */
  $$(".dissolve").forEach(function (band) {
    // each square waits for its own moment: row by row from the bottom,
    // alternating colours first, with a little scatter so it never looks ruled
    var squares = $$("i", band);
    var base = [0.15, 0.4, 0.62];                    // bottom row first
    function assign() {
      var cols = getComputedStyle(band).gridTemplateColumns.split(" ").length || 16;
      var shown = squares.filter(function (sq) { return sq.offsetParent !== null; });
      var rows = Math.ceil(shown.length / cols);
      shown.forEach(function (sq, n) {
        var row = Math.floor(n / cols), col = n % cols;
        var fromBottom = Math.min(2, rows - 1 - row);
        var parity = (row + col) % 2;
        var scatter = ((col * 7 + row * 13) % 10) / 10;
        sq.style.setProperty("--t", (base[fromBottom] + parity * 0.1 + scatter * 0.2).toFixed(3));
      });
    }
    assign();
    window.addEventListener("resize", assign);
    // 0 as the band comes up from the bottom edge, 1 once it stands a quarter of the screen above it
    if (motion) Lux.scene(band, { mode: function (r, vh) { return (vh - r.top) / (vh * 0.25 + r.height); } });
  });

  /* ---------- the four steps: the line fills and each step lights as it is reached ---------- */
  $$("[data-pipe]").forEach(function (list) {
    var items = $$("li", list);
    if (!motion) { items.forEach(function (li) { li.classList.add("is-on"); }); return; }
    Lux.scene(list, {
      mode: function (r, vh) { return (vh * 0.86 - r.top) / (vh * 0.5); },
      smooth: 0.14,
      onUpdate: function (p) {
        items.forEach(function (li, i) { li.classList.toggle("is-on", p >= (i / (items.length - 1)) * 0.96 + 0.02); });
      }
    });
  });

  /* ---------- the footer's large name rises as the page ends ---------- */
  if (motion) {
    $$("[data-ftr-mark]").forEach(function (mark) {
      Lux.scene(mark, { mode: function (r, vh) { return (vh - r.top) / (r.height * 0.9); }, smooth: 0.14 });
    });
  }

  /* ---------- light that follows the pointer ---------- */
  if (finePointer) {
    $$("[data-glow]").forEach(function (card) {
      if (!$(":scope > .glow", card)) card.insertBefore(el("span", "glow"), card.firstChild);
      var pending = false, x = 0, y = 0;
      card.addEventListener("pointermove", function (e) {
        var r = card.getBoundingClientRect();
        x = e.clientX - r.left; y = e.clientY - r.top;
        if (pending) return;
        pending = true;
        requestAnimationFrame(function () {
          pending = false;
          card.style.setProperty("--mx", x.toFixed(1) + "px");
          card.style.setProperty("--my", y.toFixed(1) + "px");
        });
      });
    });
    if (motion) {
      // the main buttons lean toward the pointer
      $$(".btn-primary").forEach(function (btn) {
        btn.addEventListener("pointermove", function (e) {
          var r = btn.getBoundingClientRect();
          btn.style.setProperty("--bx", (((e.clientX - r.left) / r.width - 0.5) * 10).toFixed(1) + "px");
          btn.style.setProperty("--by", (((e.clientY - r.top) / r.height - 0.5) * 8).toFixed(1) + "px");
        });
        btn.addEventListener("pointerleave", function () {
          btn.style.setProperty("--bx", "0px");
          btn.style.setProperty("--by", "0px");
        });
      });
      $$("[data-spot]").forEach(function (stage) {
        var spot = $(".fx-spot", stage);
        if (!spot) return;
        var tx = 0, ty = 0, cx = 0, cy = 0, running = false, seen = false;
        function step() {
          cx += (tx - cx) * 0.09; cy += (ty - cy) * 0.09;
          spot.style.setProperty("--sx", cx.toFixed(1) + "px");
          spot.style.setProperty("--sy", cy.toFixed(1) + "px");
          if (Math.abs(tx - cx) + Math.abs(ty - cy) > 0.6) requestAnimationFrame(step); else running = false;
        }
        stage.addEventListener("pointermove", function (e) {
          var r = stage.getBoundingClientRect();
          tx = e.clientX - r.left; ty = e.clientY - r.top;
          if (!seen) { seen = true; cx = tx; cy = ty; spot.classList.add("is-on"); }
          if (!running) { running = true; requestAnimationFrame(step); }
        });
        stage.addEventListener("pointerleave", function () { seen = false; spot.classList.remove("is-on"); });
      });
    }
  }

  /* ---------- the rail and the progress line ---------- */
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
    var line = el("div", "progress"); line.appendChild(el("i"));
    line.setAttribute("aria-hidden", "true");
    document.body.appendChild(line);

    var fill = bar.firstChild, tick = line.firstChild, pending = false, current = -1;
    function update() {
      pending = false;
      var doc = document.documentElement, max = doc.scrollHeight - window.innerHeight;
      var p = max > 0 ? clamp(window.scrollY / max) : 0;
      fill.style.setProperty("--p", p.toFixed(4));
      tick.style.setProperty("--p", p.toFixed(4));
      var probe = window.innerHeight * 0.4, at = 0;
      for (var i = 0; i < marks.length; i++) if (marks[i].getBoundingClientRect().top <= probe) at = i;
      if (at !== current) {
        current = at;
        links.forEach(function (a, i) { if (i === at) a.setAttribute("aria-current", "true"); else a.removeAttribute("aria-current"); });
      }
      var foot = $(".ftr");
      navEl.classList.toggle("is-off", !!foot && foot.getBoundingClientRect().top < window.innerHeight * 0.7);
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
        if (!a) return;
        card.href = a.browser_download_url;
        var size = $("[data-size]", card);
        if (size) size.textContent = fmtSize(a.size);
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

  /* ---------- loops run only while they are on screen ---------- */
  $$("[data-live]").forEach(function (node) {
    Lux.whileVisible(node, function (on) { node.classList.toggle("is-live", on && !document.hidden); }, 0.2);
  });
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) $$("[data-live].is-live").forEach(function (n) { n.classList.remove("is-live"); n.setAttribute("data-was-live", ""); });
    else $$("[data-was-live]").forEach(function (n) { n.removeAttribute("data-was-live"); n.classList.add("is-live"); });
  });

  root.classList.add("is-ready");
})();
