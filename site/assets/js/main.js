/* luminexchess.com: progressive enhancements. The page works without this file. */
(function () {
  "use strict";

  var root = document.documentElement;
  root.classList.remove("no-js");
  root.classList.add("js");

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

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
      track.style.setProperty("--zero", pct(0) + "%");
      track.style.setProperty("--lo", pct(elo - ci) + "%");
      track.style.setProperty("--w", (pct(elo + ci) - pct(elo - ci)) + "%");
      track.style.setProperty("--pt", pct(elo) + "%");
    });
    if (!("IntersectionObserver" in window) || reduceMotion.matches) {
      chart.classList.add("is-ready");
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) {
        chart.classList.add("is-ready");
        io.disconnect();
      }
    }, { threshold: 0.35 });
    io.observe(chart);
  })();

  /* ---------- reveal sections as they scroll in ---------- */
  (function reveal() {
    if (!("IntersectionObserver" in window) || reduceMotion.matches) return;
    var els = document.querySelectorAll(".section-head, .card, .net, .split, .pipeline li, .sprt, .dl, .howto-step");
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
})();
