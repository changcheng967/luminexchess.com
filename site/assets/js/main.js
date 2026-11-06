/* luminexchess.com: progressive enhancements. The page works without this file. */
(function () {
  "use strict";

  var root = document.documentElement;
  root.classList.remove("no-js");
  root.classList.add("js");

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  // run fn once, when el first scrolls into view (at once without IntersectionObserver)
  function onVisible(el, fn, threshold) {
    if (!("IntersectionObserver" in window) || reduceMotion.matches) { fn(); return; }
    var io = new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) { io.disconnect(); fn(); }
    }, { threshold: threshold || 0.3 });
    io.observe(el);
  }

  /* ---------- header: solid background once the page scrolls ---------- */
  var header = document.querySelector(".site-header");
  function onScroll() {
    header.classList.toggle("is-scrolled", window.scrollY > 8);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ---------- mobile navigation ---------- */
  var toggle = document.querySelector(".nav-toggle");
  var nav = document.getElementById("site-nav");
  function setNav(open) {
    nav.classList.toggle("is-open", open);
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
  }
  toggle.addEventListener("click", function () {
    setNav(!nav.classList.contains("is-open"));
  });
  nav.addEventListener("click", function (e) {
    if (e.target.closest("a")) setNav(false);
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && nav.classList.contains("is-open")) {
      setNav(false);
      toggle.focus();
    }
  });
  document.addEventListener("click", function (e) {
    if (nav.classList.contains("is-open") && !e.target.closest(".site-nav, .nav-toggle")) setNav(false);
  });

  /* ---------- navigation: mark the section on screen ---------- */
  (function scrollspy() {
    if (!("IntersectionObserver" in window)) return;
    var links = {}, order = [], showing = {};
    nav.querySelectorAll('a[href^="#"]').forEach(function (a) {
      var id = a.getAttribute("href").slice(1), sec = document.getElementById(id);
      if (!sec) return;
      links[id] = a;
      order.push(id);
    });
    function update() {
      var active = null;
      for (var i = 0; i < order.length; i++) if (showing[order[i]]) { active = order[i]; break; }
      order.forEach(function (id) {
        var on = id === active;
        links[id].classList.toggle("is-active", on);
        if (on) links[id].setAttribute("aria-current", "location"); else links[id].removeAttribute("aria-current");
      });
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { showing[e.target.id] = e.isIntersecting; });
      update();
    }, { rootMargin: "-45% 0px -50% 0px" });
    order.forEach(function (id) { io.observe(document.getElementById(id)); });
  })();

  /* ---------- hero: squares of light drifting off the knight ---------- */
  (function particles() {
    var canvas = document.querySelector(".hero-canvas");
    var art = document.querySelector(".hero-art img");
    if (!canvas || !art || !canvas.getContext) return;
    var ctx = canvas.getContext("2d");
    var dpr = 1, w = 0, h = 0, parts = [], raf = 0, visible = true;
    var C0 = [110, 231, 249], C1 = [167, 139, 250];

    function source() {
      var a = art.getBoundingClientRect(), c = canvas.getBoundingClientRect();
      return { x: a.left - c.left + a.width * 0.47, y: a.top - c.top + a.height * 0.47, s: a.width };
    }
    function spawn(o, fresh) {
      // the logo's particles stream up and to the left of the knight's mane
      var ang = -2.3 + (Math.random() - 0.5) * 1.0;
      var speed = 0.12 + Math.random() * 0.42;
      var p = {
        x: o.x + (Math.random() - 0.65) * o.s * 0.32,
        y: o.y + (Math.random() - 0.35) * o.s * 0.36,
        vx: Math.cos(ang) * speed,
        vy: Math.sin(ang) * speed,
        size: 1.4 + Math.pow(Math.random(), 2) * 4.2,
        max: 240 + Math.random() * 460,
        life: 0,
        t: Math.random()
      };
      if (fresh) p.life = Math.random() * p.max;
      return p;
    }
    function count() {
      return w < 700 ? 46 : 110;
    }
    function resize() {
      var r = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = r.width; h = r.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var o = source();
      parts = [];
      for (var i = 0; i < count(); i++) parts.push(spawn(o, true));
    }
    function draw(step) {
      var o = source();
      ctx.clearRect(0, 0, w, h);
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        if (step) {
          p.life += 1;
          p.x += p.vx * (1 + p.life / p.max);
          p.y += p.vy * (1 + p.life / p.max);
          if (p.life >= p.max || p.x < -20 || p.y < -20) { parts[i] = spawn(o, false); continue; }
        }
        var k = p.life / p.max;
        var alpha = k < 0.15 ? k / 0.15 : k > 0.6 ? Math.max(0, (1 - k) / 0.4) : 1;
        alpha *= 0.75;
        var r = Math.round(C0[0] + (C1[0] - C0[0]) * p.t);
        var g = Math.round(C0[1] + (C1[1] - C0[1]) * p.t);
        var b = Math.round(C0[2] + (C1[2] - C0[2]) * p.t);
        var x = Math.round(p.x), y = Math.round(p.y), s = p.size;
        ctx.fillStyle = "rgba(" + r + "," + g + "," + b + "," + (alpha * 0.18).toFixed(3) + ")";
        ctx.fillRect(x - s, y - s, s * 3, s * 3);          // soft halo
        ctx.fillStyle = "rgba(" + r + "," + g + "," + b + "," + alpha.toFixed(3) + ")";
        ctx.fillRect(x, y, s, s);
      }
    }
    function frame() {
      draw(true);
      raf = window.requestAnimationFrame(frame);
    }
    function start() {
      if (raf || reduceMotion.matches || !visible || document.hidden) return;
      raf = window.requestAnimationFrame(frame);
    }
    function stop() {
      if (raf) window.cancelAnimationFrame(raf);
      raf = 0;
    }
    resize();
    draw(false);
    window.addEventListener("resize", function () { resize(); draw(false); });
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) {
        visible = entries[0].isIntersecting;
        if (visible) start(); else stop();
      }).observe(canvas);
    }
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) stop(); else start();
    });
    reduceMotion.addEventListener && reduceMotion.addEventListener("change", function () {
      if (reduceMotion.matches) { stop(); draw(false); } else start();
    });
    if (art.complete) start(); else art.addEventListener("load", function () { resize(); start(); });
  })();

  /* ---------- network diagram: one detail panel for the selected layer ---------- */
  (function network() {
    var layers = document.querySelectorAll(".net-layer");
    var panel = document.getElementById("net-detail");
    if (!layers.length || !panel) return;
    function select(li) {
      layers.forEach(function (l) {
        l.querySelector(".net-btn").setAttribute("aria-pressed", l === li ? "true" : "false");
      });
      var name = li.querySelector(".net-name").textContent;
      var size = li.querySelector(".net-size").textContent;
      panel.textContent = "";
      var strong = document.createElement("strong");
      strong.textContent = name + " (" + size + "). ";
      panel.appendChild(strong);
      panel.appendChild(document.createTextNode(li.querySelector(".net-text").textContent));
    }
    layers.forEach(function (li) {
      li.querySelector(".net-btn").addEventListener("click", function () { select(li); });
    });
    select(layers[1]);
  })();

  /* ---------- SPRT chart: place each interval on the shared scale ---------- */
  (function sprt() {
    var chart = document.querySelector(".sprt-chart");
    if (!chart) return;
    var min = parseFloat(chart.getAttribute("data-min"));
    var max = parseFloat(chart.getAttribute("data-max"));
    function pct(v) { return ((v - min) / (max - min)) * 100; }
    chart.querySelectorAll("[data-tick]").forEach(function (t) {
      t.style.setProperty("--x", pct(parseFloat(t.getAttribute("data-tick"))) + "%");
    });
    chart.querySelectorAll(".sprt-row").forEach(function (row) {
      var elo = parseFloat(row.getAttribute("data-elo"));
      var ci = parseFloat(row.getAttribute("data-ci"));
      var track = row.querySelector(".sprt-track");
      // intervals past the right edge are drawn to the edge and marked with an arrow
      var lo = Math.max(min, Math.min(max - 4, elo - ci));
      var hi = Math.min(max, elo + ci);
      row.classList.toggle("is-clip", elo + ci > max);
      row.classList.toggle("is-off", elo > max);
      track.style.setProperty("--zero", pct(0) + "%");
      track.style.setProperty("--lo", pct(lo) + "%");
      track.style.setProperty("--w", Math.max(0, pct(hi) - pct(lo)) + "%");
      track.style.setProperty("--pt", pct(Math.min(max, elo)) + "%");
    });
    onVisible(chart, function () { chart.classList.add("is-ready"); }, 0.2);
  })();

  /* ---------- strength ladder: win/draw/loss bars ---------- */
  (function ladder() {
    var list = document.querySelector(".ladder");
    if (!list) return;
    list.querySelectorAll("[data-wdl]").forEach(function (row) {
      var n = row.getAttribute("data-wdl").split("/").map(Number);
      var total = n[0] + n[1] + n[2];
      if (!total) return;
      row.style.setProperty("--w", (100 * n[0] / total) + "%");
      row.style.setProperty("--d", (100 * n[1] / total) + "%");
      row.style.setProperty("--l", (100 * n[2] / total) + "%");
    });
    onVisible(list, function () { list.classList.add("is-ready"); }, 0.2);
  })();

  /* ---------- search speed bars ---------- */
  (function speed() {
    var bars = document.querySelector(".bars");
    if (!bars) return;
    var max = parseFloat(bars.getAttribute("data-max"));
    bars.querySelectorAll(".bar").forEach(function (b) {
      b.style.setProperty("--v", (100 * parseFloat(b.getAttribute("data-v")) / max) + "%");
    });
    onVisible(bars, function () { bars.classList.add("is-ready"); }, 0.3);
  })();

  /* ---------- search illustration: one idea at a time ---------- */
  (function search() {
    var fig = document.querySelector(".search");
    if (!fig) return;
    var buttons = fig.querySelectorAll(".search-step");
    var texts = fig.querySelectorAll(".search-text");
    var current = 1, timer = 0, auto = true, onScreen = false;
    function set(n) {
      current = n;
      for (var i = 1; i <= 6; i++) {          // s1..sN: ideas shown so far; now-N: the current one
        fig.classList.toggle("s" + i, i <= n);
        fig.classList.toggle("now-" + i, i === n);
      }
      buttons.forEach(function (b) {
        b.setAttribute("aria-pressed", Number(b.getAttribute("data-step")) === n ? "true" : "false");
      });
      texts.forEach(function (t) { t.hidden = Number(t.getAttribute("data-step")) !== n; });
    }
    function tick() {
      clearTimeout(timer);
      if (!auto || !onScreen || document.hidden || reduceMotion.matches) return;
      timer = setTimeout(function () { set(current % 6 + 1); tick(); }, 4600);
    }
    buttons.forEach(function (b) {
      b.addEventListener("click", function () {
        auto = false;
        clearTimeout(timer);
        set(Number(b.getAttribute("data-step")));
      });
    });
    set(1);
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) {
        onScreen = entries[0].isIntersecting;
        if (onScreen) tick(); else clearTimeout(timer);
      }, { threshold: 0.4 }).observe(fig);
    }
    document.addEventListener("visibilitychange", tick);
  })();

  /* ---------- reveal sections as they scroll in ---------- */
  (function reveal() {
    if (!("IntersectionObserver" in window) || reduceMotion.matches) return;
    var els = document.querySelectorAll(".section-head, .card, .net, .split, .pipeline li, .sprt, .dl, .howto-step, .viewer, .search, .speed, .ladder, .fact, .tl, .faq details");
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.add("is-visible");
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    els.forEach(function (el) {
      el.classList.add("reveal");
      io.observe(el);
    });
  })();

  /* ---------- downloads: point at the visitor's system ---------- */
  (function recommend() {
    var ua = navigator.userAgent || "";
    var plat = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || "";
    var s = (plat + " " + ua).toLowerCase();
    var os = null;
    if (/android|iphone|ipad|ipod/.test(s)) os = null;
    else if (s.indexOf("win") !== -1) os = "windows";
    else if (s.indexOf("mac") !== -1) os = "mac";
    else if (s.indexOf("linux") !== -1 || s.indexOf("x11") !== -1) os = "linux";
    if (!os) return;
    var card = document.querySelector('.dl[data-os="' + os + '"]');
    if (card) card.classList.add("is-recommended");
  })();

  /* ---------- copy buttons ---------- */
  document.querySelectorAll(".copy").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var pre = document.getElementById(btn.getAttribute("data-copy"));
      if (!pre || !navigator.clipboard) return;
      navigator.clipboard.writeText(pre.textContent.trim()).then(function () {
        btn.classList.add("is-done");
        btn.querySelector("use").setAttribute("href", "#i-check");
        setTimeout(function () {
          btn.classList.remove("is-done");
          btn.querySelector("use").setAttribute("href", "#i-copy");
        }, 1600);
      });
    });
  });

  /* ---------- latest release from GitHub (static v6.3.0 links are the fallback) ---------- */
  (function latestRelease() {
    var API = "https://api.github.com/repos/changcheng967/Luminex/releases/latest";
    var KEY = "lux-release-v1";
    function fmtSize(bytes) {
      if (bytes >= 1048576) return Math.round(bytes / 1048576) + " MB";
      return Math.round(bytes / 1024) + " KB";
    }
    function fmtDate(iso) {
      var d = new Date(iso);
      if (isNaN(d)) return null;
      return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
    }
    function apply(rel) {
      if (!rel || !rel.tag_name || !rel.assets) return;
      var tag = rel.tag_name;
      document.querySelectorAll("[data-release-tag]").forEach(function (el) { el.textContent = tag; });
      // notes that apply to one release only, such as setting NNUEFile by hand in v6.3.0
      document.querySelectorAll("[data-if-tag]").forEach(function (el) { el.hidden = el.getAttribute("data-if-tag") !== tag; });
      document.querySelectorAll("[data-release-name]").forEach(function (el) { el.textContent = rel.name || ("Luminex " + tag); });
      var date = fmtDate(rel.published_at);
      document.querySelectorAll("[data-release-date]").forEach(function (el) {
        if (date) { el.textContent = date; el.setAttribute("datetime", rel.published_at.slice(0, 10)); }
      });
      document.querySelectorAll("[data-release-url]").forEach(function (el) { if (rel.html_url) el.href = rel.html_url; });
      var byName = {};
      rel.assets.forEach(function (a) { byName[a.name] = a; });
      document.querySelectorAll("[data-asset]").forEach(function (card) {
        var a = byName[card.getAttribute("data-asset")];
        if (!a) return;
        card.href = a.browser_download_url;
        var size = card.querySelector("[data-size]");
        if (size) size.textContent = fmtSize(a.size);
      });
      document.querySelectorAll("[data-asset-link]").forEach(function (link) {
        var a = byName[link.getAttribute("data-asset-link")];
        if (a) link.href = a.browser_download_url;
      });
    }
    try {
      var cached = JSON.parse(sessionStorage.getItem(KEY) || "null");
      if (cached && Date.now() - cached.at < 3600000) { apply(cached.rel); return; }
    } catch (e) { /* storage unavailable */ }
    if (!window.fetch) return;
    var ctrl = window.AbortController ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 6000) : 0;
    fetch(API, { headers: { Accept: "application/vnd.github+json" }, signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (rel) {
        clearTimeout(timer);
        if (!rel) return;
        var slim = {
          tag_name: rel.tag_name, name: rel.name, published_at: rel.published_at, html_url: rel.html_url,
          assets: (rel.assets || []).map(function (a) {
            return { name: a.name, size: a.size, browser_download_url: a.browser_download_url };
          })
        };
        try { sessionStorage.setItem(KEY, JSON.stringify({ at: Date.now(), rel: slim })); } catch (e) { /* ignore */ }
        apply(slim);
      })
      .catch(function () { clearTimeout(timer); });
  })();

  var SVGNS = "http://www.w3.org/2000/svg";
  function svgEl(tag, attrs, cls) {
    var e = document.createElementNS(SVGNS, tag);
    if (cls) e.setAttribute("class", cls);
    for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) e.setAttribute(k, attrs[k]);
    return e;
  }

  /* ---------- hero: a real win, replayed with Luminex's own score ---------- */
  (function liveBoard() {
    var fig = document.querySelector(".live");
    if (!fig || !window.fetch || !window.JSON) return;
    var board = fig.querySelector(".live-board");
    var fill = fig.querySelector(".evalbar-fill");
    var elMove = fig.querySelector("[data-live-move]");
    var elEval = fig.querySelector("[data-live-eval]");
    var elDepth = fig.querySelector("[data-live-depth]");
    var elCap = fig.querySelector("[data-live-caption]");
    var elTitle = fig.querySelector("[data-live-title]");
    var STEP = 1150, HOLD = 4600, OPEN = 2600;
    var games = [], gi = 0, ply = -1, timer = 0, on = false, seen = false, paused = false;
    var live = {}, hlFrom, hlTo;

    function setSq(e, f, r) { e.style.setProperty("--x", f); e.style.setProperty("--y", r); }
    function piece(code) {
      var svg = svgEl("svg", { viewBox: "0 0 45 45", "aria-hidden": "true", focusable: "false" }, "pc " + (code.charAt(0) === "w" ? "w" : "b"));
      svg.appendChild(svgEl("use", { href: "#p-" + code.charAt(1) }));
      svg.setAttribute("data-code", code);
      return svg;
    }
    function parse(fen) {
      var out = {}, rows = fen.split(" ")[0].split("/");
      for (var r = 0; r < 8; r++) {
        var f = 0;
        for (var i = 0; i < rows[r].length; i++) {
          var ch = rows[r].charAt(i);
          if (ch >= "1" && ch <= "8") { f += +ch; continue; }
          out[f + "," + r] = (ch === ch.toUpperCase() ? "w" : "b") + ch.toUpperCase();
          f++;
        }
      }
      return out;
    }
    function sqOf(s) { return [s.charCodeAt(0) - 97, 8 - (+s.charAt(1))]; }
    // make the board match fen; animate the move from uci when given
    function show(fen, uci) {
      var want = parse(fen);
      if (uci) {
        var a = sqOf(uci.slice(0, 2)), b = sqOf(uci.slice(2, 4));
        var ka = a[0] + "," + a[1], kb = b[0] + "," + b[1];
        if (live[ka]) {
          if (live[kb]) { board.removeChild(live[kb]); }
          live[kb] = live[ka]; delete live[ka];
          setSq(live[kb], b[0], b[1]);
        }
        setSq(hlFrom, a[0], a[1]); setSq(hlTo, b[0], b[1]);
        hlFrom.hidden = hlTo.hidden = false;
      } else {
        hlFrom.hidden = hlTo.hidden = true;
      }
      // reconcile: castling rooks, en passant, promotions, or a fresh position
      var k;
      for (k in live) {
        if (Object.prototype.hasOwnProperty.call(live, k) && live[k].getAttribute("data-code") !== want[k]) {
          board.removeChild(live[k]); delete live[k];
        }
      }
      for (k in want) {
        if (Object.prototype.hasOwnProperty.call(want, k) && !live[k]) {
          var p = piece(want[k]), xy = k.split(",");
          setSq(p, +xy[0], +xy[1]);
          board.appendChild(p); live[k] = p;
        }
      }
    }
    function reset(fen) {
      board.textContent = "";
      live = {};
      hlFrom = document.createElement("span"); hlFrom.className = "hl"; hlFrom.hidden = true;
      hlTo = document.createElement("span"); hlTo.className = "hl"; hlTo.hidden = true;
      board.appendChild(hlFrom); board.appendChild(hlTo);
      board.classList.add("is-instant");
      show(fen, null);
      board.getBoundingClientRect();
      board.classList.remove("is-instant");
    }
    function lumIsWhite(g) { return g.white === "Luminex"; }
    // each engine reports its own score after its move; turn it into Luminex's view
    function lumScore(g, q) {
      var mine = q.by === "l";
      var cp = q.mate != null ? (q.mate > 0 ? 1 : -1) * 2000 : q.cp;
      return mine ? cp : -cp;
    }
    function fmt(g, q) {
      if (q.mate != null) { var m = q.by === "l" ? q.mate : -q.mate; return (m > 0 ? "#" : "#-") + Math.abs(m); }
      var v = lumScore(g, q) / 100;
      return (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(2);
    }
    function caption(text) {
      if (!text || elCap.textContent === text) return;
      elCap.classList.add("is-swapping");
      setTimeout(function () { elCap.textContent = text; elCap.classList.remove("is-swapping"); }, 260);
    }
    function render() {
      var g = games[gi], q = g.plies[ply];
      show(q.fen, q.uci);
      var s = lumScore(g, q), white = lumIsWhite(g) ? s : -s;
      fill.style.setProperty("--h", (100 / (1 + Math.exp(-white / 260))).toFixed(1) + "%");
      var wtm = (g.whiteFirst ? ply % 2 === 0 : ply % 2 === 1);
      var no = g.startMove + Math.floor((ply + (g.whiteFirst ? 0 : 1)) / 2);
      elMove.textContent = no + (wtm ? "." : "…") + " " + q.san;
      elEval.textContent = fmt(g, q);
      elEval.className = s > 30 ? "is-up" : s < -30 ? "is-down" : "";
      if (q.depth) elDepth.textContent = q.depth;
      var moment = g.moments && g.moments[String(ply)];
      if (moment) caption(moment);
      if (ply === g.plies.length - 1) caption((g.result === "1-0") === lumIsWhite(g) ? "Luminex wins, " + g.result.replace("-", "–") + ". " + g.story : g.story);
    }
    function load(i) {
      gi = i; ply = -1;
      var g = games[gi];
      elTitle.innerHTML = "";
      var a = document.createElement("b"); a.textContent = "Luminex";
      elTitle.appendChild(a);
      elTitle.appendChild(document.createTextNode(lumIsWhite(g) ? " vs " + g.black : " vs " + g.white + ", as Black"));
      reset(g.startFen + " w - - 0 1");
      fill.style.setProperty("--h", "50%");
      elMove.textContent = g.startMove + ".";
      elEval.textContent = "+0.00"; elEval.className = "";
      caption(g.story);
    }
    function tick() {
      timer = 0;
      if (!on) return;
      var g = games[gi];
      if (ply >= g.plies.length - 1) { load((gi + 1) % games.length); timer = setTimeout(tick, OPEN); return; }
      ply++;
      render();
      timer = setTimeout(tick, ply === g.plies.length - 1 ? HOLD : (g.moments && g.moments[String(ply)] ? STEP * 2.6 : STEP));
    }
    function update() {
      var run = seen && !paused && !document.hidden;
      if (run && !on) { on = true; fig.classList.add("is-playing"); if (!timer) timer = setTimeout(tick, ply < 0 ? OPEN : STEP); }
      else if (!run && on) { on = false; fig.classList.remove("is-playing"); clearTimeout(timer); timer = 0; }
    }
    fetch(fig.getAttribute("data-src"))
      .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
      .then(function (data) {
        games = (data || []).filter(function (g) { return g.plies && g.plies.length; });
        if (!games.length) return;
        load(0);
        if (reduceMotion.matches) {
          // one still frame: the first moment Luminex saw coming
          var g = games[0], keys = Object.keys(g.moments || {}).map(Number).sort(function (a, b) { return a - b; });
          ply = keys.length ? keys[0] : Math.min(20, g.plies.length - 1);
          board.classList.add("is-instant");
          render();
          return;
        }
        fig.addEventListener("mouseenter", function () { paused = true; update(); });
        fig.addEventListener("mouseleave", function () { paused = false; update(); });
        fig.addEventListener("focusin", function () { paused = true; update(); });
        fig.addEventListener("focusout", function () { paused = false; update(); });
        document.addEventListener("visibilitychange", update);
        if ("IntersectionObserver" in window) {
          new IntersectionObserver(function (es) { seen = es[0].isIntersecting; update(); }, { threshold: 0.25 }).observe(fig);
        } else { seen = true; update(); }
      })
      .catch(function () { /* the static caption stays */ });
  })();

  /* ---------- history: the climb, rating by release ---------- */
  (function climb() {
    var fig = document.querySelector(".climb");
    if (!fig) return;
    var plot = fig.querySelector(".climb-plot");
    var pts;
    try { pts = JSON.parse(fig.getAttribute("data-points") || "[]"); } catch (e) { return; }
    var goal = +fig.getAttribute("data-goal") || 0;
    if (!plot || pts.length < 2) return;
    var W = 880, H = 320, L = 52, R = 30, T = 30, B = 58, PAD = 34;
    var minV = Math.min.apply(null, pts.map(function (p) { return p.elo; }));
    var lo = Math.floor((minV - 200) / 100) * 100, hi = Math.ceil((Math.max(goal, pts[pts.length - 1].elo) + 100) / 100) * 100;
    // points sit inside the axes so the first label never meets the scale
    function x(i) { return L + PAD + i * (W - L - R - 2 * PAD) / (pts.length - 1); }
    function y(v) { return T + (hi - v) / (hi - lo) * (H - T - B); }

    var svg = svgEl("svg", { viewBox: "0 0 " + W + " " + H, role: "img", "aria-labelledby": "climb-title" }, "climb-svg");
    var defs = svgEl("defs", {});
    var lg = svgEl("linearGradient", { id: "climb-fill", x1: "0", y1: "0", x2: "0", y2: "1" });
    lg.appendChild(svgEl("stop", { offset: "0", "stop-color": "#74e4f7", "stop-opacity": "0.26" }));
    lg.appendChild(svgEl("stop", { offset: "1", "stop-color": "#74e4f7", "stop-opacity": "0" }));
    defs.appendChild(lg); svg.appendChild(defs);

    var grid = svgEl("g", {}, "c-grid"), axis = svgEl("g", {}, "c-axis");
    for (var v = lo + 100; v <= hi; v += 200) {
      grid.appendChild(svgEl("line", { x1: L, x2: W - R, y1: y(v), y2: y(v) }));
      var t = svgEl("text", { x: L - 10, y: y(v) + 4, "text-anchor": "end" }); t.textContent = v; axis.appendChild(t);
    }
    svg.appendChild(grid); svg.appendChild(axis);

    if (goal) {
      var gg = svgEl("g", {}, "c-goal");
      gg.appendChild(svgEl("line", { x1: L, x2: W - R, y1: y(goal), y2: y(goal) }));
      var gt = svgEl("text", { x: W - R, y: y(goal) - 9, "text-anchor": "end" }); gt.textContent = "GOAL " + goal;
      gg.appendChild(gt); svg.appendChild(gg);
    }

    var d = pts.map(function (p, i) { return (i ? "L" : "M") + x(i).toFixed(1) + " " + y(p.elo).toFixed(1); }).join(" ");
    svg.appendChild(svgEl("path", { d: d + " L" + x(pts.length - 1) + " " + (H - B) + " L" + x(0) + " " + (H - B) + " Z" }, "c-area"));
    svg.appendChild(svgEl("path", { d: d }, "c-glow"));
    svg.appendChild(svgEl("path", { d: d }, "c-line"));

    var tip = document.createElement("div");
    tip.className = "climb-tip"; tip.setAttribute("aria-hidden", "true");
    function showTip(i, g) {
      var p = pts[i];
      tip.textContent = "";
      var b = document.createElement("b"); b.textContent = p.v + " · " + p.d; tip.appendChild(b);
      var e = document.createElement("span"); e.className = "t-elo"; e.textContent = "≈" + p.elo + " Elo"; tip.appendChild(e);
      tip.appendChild(document.createElement("br"));
      tip.appendChild(document.createTextNode(p.t));
      tip.style.setProperty("--tx", (x(i) / W * 100) + "%");
      tip.style.setProperty("--ty", (y(p.elo) / H * 100) + "%");
      tip.classList.add("is-on");
      g.classList.add("is-hover");
    }
    function hideTip(g) { tip.classList.remove("is-on"); g.classList.remove("is-hover"); }

    pts.forEach(function (p, i) {
      var now = i === pts.length - 1;
      var g = svgEl("g", { tabindex: "0", "aria-label": p.v + ", " + p.d + ": about " + p.elo + " Elo. " + p.t }, "c-pt" + (now ? " is-now" : ""));
      g.appendChild(svgEl("circle", { cx: x(i), cy: y(p.elo), r: 22 }, "c-hit"));
      g.appendChild(svgEl("circle", { cx: x(i), cy: y(p.elo), r: now ? 7.5 : 6 }));
      var te = svgEl("text", { x: x(i), y: y(p.elo) - 16, "text-anchor": "middle" }, "c-elo"); te.textContent = "≈" + p.elo; g.appendChild(te);
      var tv = svgEl("text", { x: x(i), y: H - B + 24, "text-anchor": "middle" }, "c-ver"); tv.textContent = p.v; g.appendChild(tv);
      var td = svgEl("text", { x: x(i), y: H - B + 41, "text-anchor": "middle" }, "c-date"); td.textContent = p.d; g.appendChild(td);
      g.addEventListener("mouseenter", function () { showTip(i, g); });
      g.addEventListener("mouseleave", function () { hideTip(g); });
      g.addEventListener("focus", function () { showTip(i, g); });
      g.addEventListener("blur", function () { hideTip(g); });
      svg.appendChild(g);
    });
    plot.appendChild(svg);
    plot.appendChild(tip);
  })();
})();
