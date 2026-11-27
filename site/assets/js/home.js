/* luminexchess.com: the home page's scenes below the ride (ride.js draws the ride).
   - the strip of tests;
   - the chronicle, whose chart follows the timeline.
   Every scene has a still form, used without scripts or with reduced motion. */
(function () {
  "use strict";

  var Lux = window.Lux;
  if (!Lux) return;
  var $ = Lux.$, $$ = Lux.$$, el = Lux.el, clamp = Lux.clamp, motion = Lux.motion;
  var SVGNS = "http://www.w3.org/2000/svg";

  // addresses from the time the site was one page
  var moved = { "#games": "/games/", "#network": "/engine/#network", "#faq": "/download/#faq" };
  if (moved[location.hash]) { location.replace(moved[location.hash]); return; }
  window.addEventListener("hashchange", function () {
    if (moved[location.hash]) location.replace(moved[location.hash]);
  });

  function svgEl(tag, attrs, cls) {
    var e = document.createElementNS(SVGNS, tag);
    if (cls) e.setAttribute("class", cls);
    for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) e.setAttribute(k, attrs[k]);
    return e;
  }

  /* =====================================================================
     Method: the four steps, and the strip of every test
     ===================================================================== */
  (function strip() {
    var fig = $("[data-strip]");
    if (!fig) return;
    var bars = $$(".sbar", fig);
    bars.forEach(function (b, i) {
      b.style.setProperty("--i", i);
      if (parseFloat(b.getAttribute("data-text").replace("−", "-")) < 0) b.classList.add("is-neg");
    });
    // The stylesheet sizes the strip from the number of bars where a finger needs room. The newest
    // tests are at the right end, so a strip wider than its frame starts scrolled there.
    fig.style.setProperty("--bars", bars.length);
    var scroller = $(".strip-scroll", fig);
    if (scroller && scroller.scrollWidth > scroller.clientWidth + 4) scroller.scrollLeft = scroller.scrollWidth;
    // A strip that scrolls sideways takes its scale with it, so a copy of the scale stays at the left edge.
    var ticks = $$(".strip-grid text:not(.strip-end)", fig), axis = null;
    function placeAxis() {
      var wide = !!scroller && scroller.scrollWidth > scroller.clientWidth + 4;
      fig.classList.toggle("has-axis", wide);
      if (!wide) return;
      if (!axis) {
        axis = el("div", "strip-axis");
        axis.setAttribute("aria-hidden", "true");
        ticks.forEach(function (t) { axis.appendChild(el("span", "", t.textContent)); });
        fig.appendChild(axis);
      }
      var fr = fig.getBoundingClientRect(), top = 1e9, bottom = -1e9;
      ticks.forEach(function (t, i) {
        var r = t.getBoundingClientRect(), y = r.top + r.height / 2 - fr.top;
        axis.children[i].style.setProperty("--y", y.toFixed(1) + "px");
        top = Math.min(top, y); bottom = Math.max(bottom, y);
      });
      axis.style.setProperty("--t", top.toFixed(1) + "px");      // the plot's extent, for the veil behind the labels
      axis.style.setProperty("--b", bottom.toFixed(1) + "px");
    }
    // "Test 1" and the newest test's label stand at the strip's two ends: one that is scrolled
    // partly out of the frame is hidden rather than shown cut in half
    function ends() {
      if (!scroller) return;
      var max = scroller.scrollWidth - scroller.clientWidth;
      fig.classList.toggle("is-off-first", scroller.scrollLeft > 4);
      fig.classList.toggle("is-off-last", scroller.scrollLeft < max - 4);
    }
    if (scroller) scroller.addEventListener("scroll", ends, { passive: true });
    placeAxis();
    ends();
    window.addEventListener("resize", function () { placeAxis(); ends(); });

    // one tooltip, shared by every bar; the same details are in each bar's label
    var tip = el("div", "tip");
    tip.setAttribute("aria-hidden", "true");
    var tipValue = el("b"), tipTitle = el("span"), tipMeta = el("span");
    tip.appendChild(tipValue); tip.appendChild(tipTitle); tip.appendChild(tipMeta);
    fig.appendChild(tip);
    function show(bar) {
      var fr = fig.getBoundingClientRect(), br = $(".sbar-hit", bar).getBoundingClientRect();
      tipValue.textContent = bar.getAttribute("data-text") + " Elo";
      tipTitle.textContent = bar.getAttribute("data-title");
      tipMeta.textContent = "Test " + bar.getAttribute("data-test") + " · " + bar.getAttribute("data-games") + " games · " + bar.getAttribute("data-label");
      var x = clamp(br.left + br.width / 2 - fr.left, 150, fr.width - 150);
      tip.style.setProperty("--tx", x.toFixed(1) + "px");
      tip.style.setProperty("--ty", (br.top - fr.top - 8).toFixed(1) + "px");
      tip.classList.add("is-on");
    }
    function hide() { tip.classList.remove("is-on"); }
    bars.forEach(function (bar) {
      bar.addEventListener("pointerenter", function () { show(bar); });
      bar.addEventListener("pointerleave", hide);
      bar.addEventListener("focus", function () { show(bar); });
      bar.addEventListener("blur", hide);
    });
  })();

  /* =====================================================================
     Chronicle: the chart follows the timeline
     ===================================================================== */
  (function chronicle() {
    var fig = $("[data-climb]");
    if (!fig) return;
    var plot = $("[data-climb-plot]", fig), pts;
    try { pts = JSON.parse(fig.getAttribute("data-points") || "[]"); } catch (e) { return; }
    var goal = +fig.getAttribute("data-goal") || 0;
    if (!plot || pts.length < 2) return;
    // an estimate from the ladder is written with ≈; a rating measured with an interval ("pm") is written plain, its ± beside it
    function shown(p) { return p.pm ? String(p.elo) : "≈" + p.elo; }

    // The chart is drawn at the size it is shown, so its labels are never scaled down.
    var W, H, Lm = 42, Rm = 22, T = 28, B = 52, PAD, draw, groups;
    var minV = Math.min.apply(null, pts.map(function (p) { return p.elo; }));
    var lo = Math.floor((minV - 200) / 100) * 100, hi = Math.ceil((Math.max(goal, pts[pts.length - 1].elo) + 100) / 100) * 100;
    function x(i) { return Lm + PAD + i * (W - Lm - Rm - 2 * PAD) / (pts.length - 1); }
    function y(v) { return T + (hi - v) / (hi - lo) * (H - T - B); }

    function build() {
      W = Math.max(300, Math.min(680, Math.round(plot.clientWidth) || 560));
      H = Math.round(W * 0.6);
      PAD = W < 420 ? 12 : 26;
      var box = "0 0 " + W + " " + H;
      plot.textContent = "";

      // three layers: the frame, the line (uncovered from the left), and the points
      var base = svgEl("svg", { viewBox: box, "aria-hidden": "true", focusable: "false" });
      var grid = svgEl("g", {}, "c-grid"), axis = svgEl("g", {}, "c-axis");
      for (var v = lo + 100; v <= hi; v += 200) {
        grid.appendChild(svgEl("line", { x1: Lm, x2: W - Rm, y1: y(v), y2: y(v) }));
        var t = svgEl("text", { x: Lm - 9, y: y(v) + 4, "text-anchor": "end" }); t.textContent = v; axis.appendChild(t);
      }
      base.appendChild(grid); base.appendChild(axis);
      if (goal) {
        var gg = svgEl("g", {}, "c-goal");
        gg.appendChild(svgEl("line", { x1: Lm, x2: W - Rm, y1: y(goal), y2: y(goal) }));
        // at the left end, clear of the newest point's label, which climbs toward the line
        var gt = svgEl("text", { x: Lm + 6, y: y(goal) - 9, "text-anchor": "start" }); gt.textContent = "Goal " + goal;
        gg.appendChild(gt); base.appendChild(gg);
      }
      plot.appendChild(base);

      draw = el("div", "draw");
      var data = svgEl("svg", { viewBox: box, "aria-hidden": "true", focusable: "false" });
      var d = pts.map(function (p, i) { return (i ? "L" : "M") + x(i).toFixed(1) + " " + y(p.elo).toFixed(1); }).join(" ");
      data.appendChild(svgEl("path", { d: d + " L" + x(pts.length - 1) + " " + (H - B) + " L" + x(0) + " " + (H - B) + " Z" }, "c-area"));
      data.appendChild(svgEl("path", { d: d }, "c-line"));
      draw.appendChild(data);
      plot.appendChild(draw);

      var top = svgEl("svg", { viewBox: box, role: "img", "aria-labelledby": "climb-title" });
      var slot = (W - Lm - Rm - 2 * PAD) / (pts.length - 1);      // dates lose their year where the points stand close
      groups = pts.map(function (p, i) {
        var gEl = svgEl("g", {}, "c-pt");
        gEl.appendChild(svgEl("rect", { x: x(i) - 6, y: y(p.elo) - 6, width: 12, height: 12, rx: 2 }));   // a square of the board
        var ly = y(p.elo) - 15;
        if (goal && y(goal) > ly - 14 && y(goal) < ly + 4) ly = y(p.elo) + 25;      // it would sit on the goal line: below its point instead
        var te = svgEl("text", { x: x(i), y: ly, "text-anchor": "middle" }, "c-elo"); te.textContent = shown(p); gEl.appendChild(te);
        var tv = svgEl("text", { x: x(i), y: H - B + 22, "text-anchor": "middle" }, "c-ver"); tv.textContent = p.v; gEl.appendChild(tv);
        var td = svgEl("text", { x: x(i), y: H - B + 39, "text-anchor": "middle" }, "c-date"); td.textContent = slot < 104 ? p.d.replace(/ \d{4}$/, "") : p.d; gEl.appendChild(td);
        top.appendChild(gEl);
        return gEl;
      });
      plot.appendChild(top);
    }
    build();

    var numEl = $("[data-climb-odo]", fig), pmEl = $("[data-climb-pm]", fig), atEl = $("[data-climb-at]", fig), textEl = $("[data-climb-text]", fig);
    var last = pts.length - 1;
    function still() {
      draw.style.setProperty("--draw", "1");
      groups.forEach(function (gEl, i) { gEl.classList.add("is-on"); gEl.classList.toggle("is-now", i === last); });
    }
    var timeline = $("[data-timeline]"), sticky = window.matchMedia("(min-width: 941px)");
    var redraw = null, drawnAt = W, resizeTimer = 0;
    window.addEventListener("resize", function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        if (Math.abs((plot.clientWidth || drawnAt) - drawnAt) < 24) return;
        build();
        drawnAt = W;
        if (redraw) redraw(); else still();
      }, 180);
    });
    if (!motion || !timeline) { still(); return; }

    var odo = Lux.odo(numEl);
    numEl.setAttribute("data-odo-manual", "");
    numEl.classList.add("is-live");
    var items = $$(".tl", timeline), current = -2;
    // the chart shows the rating at the event in focus; -1 means no estimate yet
    function setPoint(a) {
      if (a === current) return;
      current = a;
      var i = Math.min(a, last);
      fig.classList.toggle("is-none", a < 0);
      draw.style.setProperty("--draw", a < 0 ? "0" : ((x(i) + (i === last ? Rm + PAD : 3)) / W).toFixed(4));
      groups.forEach(function (gEl, k) { gEl.classList.toggle("is-on", k <= i); gEl.classList.toggle("is-now", k === i); });
      if (a < 0) {
        odo.set("—");
        if (pmEl) pmEl.textContent = "";
        atEl.textContent = "The chart begins in August 2026";
        textEl.textContent = "";
      } else {
        odo.set(shown(pts[i]));
        if (pmEl) pmEl.textContent = pts[i].pm ? "± " + pts[i].pm : "";
        atEl.textContent = pts[i].v + " · " + pts[i].d;
        textEl.textContent = pts[i].t;
      }
      fig.classList.toggle("is-goal", a > last);
    }
    function focus() {
      if (!sticky.matches) {                    // the chart is not pinned on narrow screens: show it whole
        timeline.classList.remove("is-stepping");
        setPoint(last);
        return;
      }
      timeline.classList.add("is-stepping");
      var mid = window.innerHeight * 0.46, best = 0, dist = 1e9;
      items.forEach(function (li, k) {
        var r = li.getBoundingClientRect(), dd = Math.abs((r.top + r.bottom) / 2 - mid);
        if (dd < dist) { dist = dd; best = k; }
      });
      items.forEach(function (li, k) { li.classList.toggle("is-active", k === best); });
      setPoint(parseInt(items[best].getAttribute("data-pt"), 10));
    }
    Lux.scene(timeline, {
      mode: function (r, vh) { return (vh * 0.46 - r.top - 30) / (r.height - 60); },
      onUpdate: focus
    });
    redraw = function () { current = -2; focus(); };
    window.addEventListener("resize", focus);
    focus();
  })();

  /* =====================================================================
     Inside: the speed card counts, at the rate it states, while it is seen
     ===================================================================== */
  (function speedCount() {
    var num = $(".speed-num");
    if (!num || !motion) return;
    var rate = parseFloat(num.textContent) * 1e6;          // "1.30 million" a second
    if (!(rate > 0)) return;
    var line = el("p", "speed-tick mono");
    line.setAttribute("aria-hidden", "true");
    var n = el("span", "speed-tick-n num", "0");
    line.appendChild(n);
    line.appendChild(document.createTextNode(" positions at that rate since this came into view"));
    num.parentNode.appendChild(line);
    var t0 = 0, acc = 0, raf = 0;
    function tick(now) {
      if (!t0) t0 = now;
      n.textContent = Math.round(acc + (now - t0) / 1000 * rate).toLocaleString("en-US");
      raf = requestAnimationFrame(tick);
    }
    Lux.whileVisible(num, function (v) {
      if (v && !raf) { t0 = 0; raf = requestAnimationFrame(tick); }
      if (!v && raf) { cancelAnimationFrame(raf); raf = 0; acc = parseInt(n.textContent.replace(/,/g, ""), 10) || 0; }
    }, 0.4);
  })();

  /* =====================================================================
     Strength: the ladder
     Every opponent stands at its CCRL Blitz rating. From each, a thread of light
     runs down to the rating its own games give Luminex, and the threads meet where
     the fit puts Luminex. Drawn from the table's own rows; the table stays one
     press away, and is what a screen reader reads.
     ===================================================================== */
  (function ladder() {
    var fig = $("figure.gnt[data-gauntlet]"), list = fig && $(".gnt-rows", fig), legend = fig && $(".gnt-legend", fig);
    if (!fig || !list || !legend) return;
    function num(s) { return parseInt(String(s).replace(/[,\s]/g, ""), 10); }
    function fmt(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
    var opp = [], fit = null;
    $$(".gnt-row", list).forEach(function (r) {
      var nm = $(".gnt-name", r), rt = $(".gnt-rating", r);
      if (!nm || !rt) return;
      var m = /(\d{3,4})(?:\s*±\s*(\d+))?/.exec(rt.textContent);
      if (!m) return;
      if (r.classList.contains("is-lum")) { fit = { v: +m[1], pm: +(m[2] || 0) }; return; }
      var a = $("a", nm), im = /(\d{3,4})\s*±\s*(\d+)/.exec(($(".gnt-implied", r) || nm).textContent),
          g = /\+([\d,]+)\s*=([\d,]+)\s*−([\d,]+)/.exec(($(".gnt-games", r) || nm).textContent);
      if (!a || !im || !g) return;
      var t = /\/test\/(\d+)/.exec(a.getAttribute("href") || "");
      opp.push({ name: a.textContent.trim(), href: a.href, test: t ? +t[1] : opp.length + 1, r: +m[1], imp: +im[1], err: +im[2],
                 w: num(g[1]), d: num(g[2]), l: num(g[3]), score: (($(".gnt-score", r) || {}).textContent || "").trim() });
    });
    if (!fit || opp.length < 2) return;
    var total = { w: 0, d: 0, l: 0 };
    opp.forEach(function (o) { total.w += o.w; total.d += o.d; total.l += o.l; });
    var gauntletNo = +((/gauntlet\/(\d+)/.exec(($("a[href*='/gauntlet/']", fig) || {}).href || "") || [])[1] || 1);

    /* ---------- the parts: a switch between the two views, the stage, the readout ---------- */
    var views = el("div", "seg gnt-views"), bL = el("button", "", "Ladder"), bT = el("button", "", "Table");
    views.setAttribute("role", "group");
    views.setAttribute("aria-label", "Show the gauntlet as");
    [bL, bT].forEach(function (b) { b.type = "button"; views.appendChild(b); });
    var box = el("div", "ldr"), scroller = el("div", "ldr-scroll"), stage = el("div", "ldr-stage");
    box.setAttribute("aria-hidden", "true");          // the table carries the same numbers for every reader
    scroller.appendChild(stage);
    var card = el("div", "ldr-card"), cK = el("span", "ldr-k"), cName = el("a", "ldr-name"), cRate = el("span", "ldr-rate num"),
        cField = el("canvas", "ldr-field"), cWdl = el("span", "ldr-wdl"), cSays = el("span", "ldr-says");
    cName.setAttribute("tabindex", "-1");
    var cHead = el("span", "ldr-head");
    cHead.appendChild(cName); cHead.appendChild(cRate);
    [cK, cHead, cField, cWdl, cSays].forEach(function (n) { card.appendChild(n); });
    var keyRow = el("p", "ldr-key");
    [["k-orb", "An engine, at its CCRL Blitz rating"], ["k-thread", "The rating its games give Luminex"], ["k-beam", "Luminex: the rating that fits all " + opp.length]]
      .forEach(function (k) { var s = el("span"), i = el("i", k[0]); s.appendChild(i); s.appendChild(document.createTextNode(k[1])); keyRow.appendChild(s); });
    var hint = el("p", "try");
    [["try-n", "01 · To try"], ["", "Point at an engine"], ["", "·"], ["", "its thread lights, and its games appear beside"]]
      .forEach(function (h) { hint.appendChild(el("span", h[0], h[1])); });
    var side = el("div", "ldr-side");
    side.appendChild(card); side.appendChild(hint);
    var main = el("div", "ldr-main");
    main.appendChild(scroller); main.appendChild(keyRow);
    box.appendChild(main); box.appendChild(side);
    fig.insertBefore(views, legend);
    fig.insertBefore(box, legend);

    function setView(ladderOn) {
      fig.classList.toggle("is-ladder", ladderOn);
      bL.setAttribute("aria-pressed", ladderOn ? "true" : "false");
      bT.setAttribute("aria-pressed", ladderOn ? "false" : "true");
      if (ladderOn) draw();
    }
    bL.addEventListener("click", function () { setView(true); });
    bT.addEventListener("click", function () { setView(false); });

    /* ---------- the readout: the engine under the pointer, or the fit ---------- */
    var picked = -1;
    function field(w, d, l, seed) {
      if (!Lux.cells) return;
      var C = Lux.cells, cells = C.scatter({ id: seed, k: "g", w: w, d: d, l: l });
      var cols = cells.length > 2000 ? 128 : 40, rows = Math.ceil(cells.length / cols);
      var bmp = C.fieldBitmap(cells, cols, C.palette(fig));
      var cw = Math.max(120, Math.round(cField.clientWidth || 240)), cs = cw / cols, ch = Math.ceil(rows * cs);
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      cField.width = Math.round(cw * dpr); cField.height = Math.round(ch * dpr);
      cField.style.setProperty("--h", ch + "px");
      var c = cField.getContext("2d");
      c.imageSmoothingEnabled = false;
      c.clearRect(0, 0, cField.width, cField.height);
      c.drawImage(bmp, 0, 0, cols * cs * dpr, rows * cs * dpr);
    }
    function readout(i) {
      card.classList.remove("is-swap");
      void card.offsetWidth;                          // restart the readout's fade
      card.classList.add("is-swap");
      if (i < 0) {
        cK.textContent = "Gauntlet " + gauntletNo + " · the fit";
        cName.textContent = "Luminex"; cName.removeAttribute("href");
        cRate.textContent = fit.v + " ± " + fit.pm;
        cWdl.textContent = "+" + fmt(total.w) + " =" + fmt(total.d) + " −" + fmt(total.l) + " · " + fmt(total.w + total.d + total.l) + " games";
        cSays.textContent = "Where the " + opp.length + " threads meet: the rating at which the points expected against all " + opp.length + " equal the points scored.";
        field(total.w, total.d, total.l, 9000 + gauntletNo);
        return;
      }
      var o = opp[i];
      cK.textContent = "Opponent · CCRL Blitz";
      cName.textContent = o.name; cName.setAttribute("href", o.href);
      cRate.textContent = String(o.r);
      cWdl.textContent = "+" + fmt(o.w) + " =" + fmt(o.d) + " −" + fmt(o.l) + " · " + fmt(o.w + o.d + o.l) + " games · " + o.score;
      cSays.textContent = "";
      cSays.appendChild(document.createTextNode("Its games alone put Luminex at "));
      cSays.appendChild(el("b", "num", o.imp + " ± " + o.err));
      field(o.w, o.d, o.l, o.test);
    }

    /* ---------- the stage, drawn at the size it is shown ---------- */
    var groups = [], W = 0, H = 0, X = null, yO = 0, rowY = [];
    var built = false;
    function draw() {
      if (!fig.classList.contains("is-ladder")) return;
      var w = Math.max(640, Math.floor(scroller.getBoundingClientRect().width));
      if (!w || (built && w === W)) return;
      W = w;
      built = true;
      stage.textContent = "";
      groups = []; rowY = [];
      var Lm = 22, Rm = 22, n = opp.length;
      var lo = Infinity, hi = -Infinity;
      opp.forEach(function (o) { lo = Math.min(lo, o.r, o.imp - o.err); hi = Math.max(hi, o.r, o.imp + o.err); });
      lo = Math.floor((lo - 20) / 50) * 50; hi = Math.ceil((hi + 20) / 50) * 50;
      X = function (v) { return Lm + (v - lo) / (hi - lo) * (W - Lm - Rm); };

      // Labels first: each sits on the lowest level where it clears the others, as near its engine as the
      // edges allow. Luminex takes the first level; the rest go left to right, which uses the fewest levels.
      var probe = document.createElement("canvas").getContext("2d"), cs = getComputedStyle(fig);
      var fontN = "600 12.5px " + cs.getPropertyValue("--sans"), fontR = "400 11px " + cs.getPropertyValue("--mono");
      function width(text, font) { probe.font = font; return probe.measureText(text).width; }
      var levels = [], labels = [];
      function place(cx, w) {
        var x0 = clamp(cx - w / 2, Lm - 4, W - Rm - w + 4);
        for (var k = 0; ; k++) {
          var row = levels[k] || (levels[k] = []), free = true;
          for (var j = 0; j < row.length; j++) if (x0 < row[j][1] + 14 && x0 + w > row[j][0] - 14) { free = false; break; }
          if (free) { row.push([x0, x0 + w]); return { x: x0, k: k }; }
        }
      }
      var lp = place(X(fit.v), width("Luminex", fontN) + 6 + width(fit.v + " ± " + fit.pm, fontR));
      opp.map(function (o, i) { return i; }).sort(function (a, b) { return opp[a].r - opp[b].r; }).forEach(function (i) {
        labels[i] = place(X(opp[i].r), width(opp[i].name, fontN) + 6 + width(String(opp[i].r), fontR));
      });
      var LV = 21;
      yO = 34 + levels.length * LV;
      H = Math.max(clamp(Math.round(W * 0.5), 380, 480), yO + 150 + n * 14);
      var yAxis = H - 14, yLand1 = H - 44, gapRow = Math.min(14, Math.max(9, (yLand1 - yO - 110) / n)), yLand0 = yLand1 - (n - 1) * gapRow;

      var svg = svgEl("svg", { viewBox: "0 0 " + W + " " + H, width: W, height: H, focusable: "false" }, "ldr-svg");
      var defs = svgEl("defs", {});
      svg.appendChild(defs);

      // the scale: a line every 50 Elo
      var grid = svgEl("g", {}, "ldr-grid");
      for (var v = lo; v <= hi; v += 50) {
        grid.appendChild(svgEl("line", { x1: X(v), x2: X(v), y1: yO - 18, y2: yLand1 + 12 }));
        var t = svgEl("text", { x: X(v), y: yAxis, "text-anchor": "middle" }, "ldr-tick");
        t.textContent = v;
        grid.appendChild(t);
      }
      svg.appendChild(grid);

      // Luminex: a column of light from its place among the engines down to the band the threads meet in
      var beam = svgEl("g", {}, "ldr-beam-g");
      beam.appendChild(svgEl("rect", { x: X(fit.v - fit.pm), width: X(fit.v + fit.pm) - X(fit.v - fit.pm), y: yO, height: yLand1 + 10 - yO }, "ldr-beam"));
      beam.appendChild(svgEl("line", { x1: X(fit.v), x2: X(fit.v), y1: yO + 8, y2: yLand1 + 10 }, "ldr-fit"));
      svg.appendChild(beam);

      var lumG = svgEl("g", {}, "ldr-lum"), ly = yO - 22 - lp.k * LV;
      lumG.appendChild(svgEl("line", { x1: X(fit.v), x2: X(fit.v), y1: ly + 5, y2: yO - 8 }, "ldr-lead ldr-lab"));
      var lt = svgEl("text", { x: lp.x, y: ly }, "ldr-lab");
      var lt1 = svgEl("tspan", {}, "ldr-ln ldr-lum-ln"); lt1.textContent = "Luminex";
      var lt2 = svgEl("tspan", { dx: 6 }, "ldr-lr ldr-lum-lr"); lt2.textContent = fit.v + " ± " + fit.pm;
      lt.appendChild(lt1); lt.appendChild(lt2); lumG.appendChild(lt);
      lumG.appendChild(svgEl("rect", { x: X(fit.v) - 6, y: yO - 6, width: 12, height: 12, rx: 2 }, "ldr-lum-orb ldr-orb-l"));

      // the engines nearest Luminex land on the band's first rows, the farthest on its last: the threads nest
      var order = opp.map(function (o, i) { return i; }).sort(function (a, b) { return Math.abs(opp[a].r - fit.v) - Math.abs(opp[b].r - fit.v); });
      order.forEach(function (i, k) { rowY[i] = yLand0 + k * gapRow; });
      var layer = svgEl("g", {});
      opp.forEach(function (o, i) {
        var g = svgEl("g", {}, "ldr-o");
        g.style.setProperty("--i", i);
        var x0 = X(o.r), x1 = X(o.imp), y1 = rowY[i];
        var p = labels[i], y = yO - 22 - p.k * LV;
        // the thread runs from the opponent's colour into the light
        var gid = "ldr-g" + i, lg = svgEl("linearGradient", { id: gid, gradientUnits: "userSpaceOnUse", x1: x0, y1: yO, x2: x1, y2: y1 });
        lg.appendChild(svgEl("stop", { offset: "0" }, "ldr-s0"));
        lg.appendChild(svgEl("stop", { offset: "1" }, "ldr-s1"));
        defs.appendChild(lg);
        var dy = y1 - yO, d = "M" + x0.toFixed(1) + " " + (yO + 6) + " C" + x0.toFixed(1) + " " + (yO + dy * 0.62).toFixed(1) + " " + x1.toFixed(1) + " " + (y1 - dy * 0.5).toFixed(1) + " " + x1.toFixed(1) + " " + y1.toFixed(1);
        g.appendChild(svgEl("path", { d: d, pathLength: 100, stroke: "url(#" + gid + ")" }, "ldr-thread"));
        g.appendChild(svgEl("path", { d: d, pathLength: 100 }, "ldr-spark"));
        var row = svgEl("g", {}, "ldr-row");
        row.appendChild(svgEl("line", { x1: X(o.imp - o.err), x2: X(o.imp + o.err), y1: y1, y2: y1 }, "ldr-whisk"));
        row.appendChild(svgEl("circle", { cx: x1, cy: y1, r: 3.4 }, "ldr-dot"));
        g.appendChild(row);
        g.appendChild(svgEl("line", { x1: x0, x2: x0, y1: y + 5, y2: yO - 7 }, "ldr-lead ldr-lab"));
        var tx = svgEl("text", { x: p.x, y: y }, "ldr-lab");
        var t1 = svgEl("tspan", {}, "ldr-ln"); t1.textContent = o.name;
        var t2 = svgEl("tspan", { dx: 6 }, "ldr-lr"); t2.textContent = o.r;
        tx.appendChild(t1); tx.appendChild(t2); g.appendChild(tx);
        g.appendChild(svgEl("circle", { cx: x0, cy: yO, r: 5.2 }, "ldr-orb"));
        layer.appendChild(g);
        groups.push(g);
      });
      svg.appendChild(layer);
      svg.appendChild(lumG);
      stage.appendChild(svg);
      stage.style.setProperty("--w", W + "px");
      // a ladder wider than its frame opens on Luminex
      if (scroller.scrollWidth > scroller.clientWidth + 4) scroller.scrollLeft = X(fit.v) - scroller.clientWidth / 2;
      pick(picked, true);
    }

    function pick(i, quiet) {
      if (i === picked && !quiet) return;
      picked = i;
      box.classList.toggle("is-pick", i >= 0);
      groups.forEach(function (g, k) { g.classList.toggle("is-on", k === i); });
      readout(i);
    }
    function pickAt(e) {
      if (!X) return;
      var r = stage.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top, best = -1, dist = 1e9;
      opp.forEach(function (o, i) {
        // near the track, the engine whose place is nearest; lower down, the thread whose row is nearest
        var dd = py < (yO + rowY[i]) / 2 + 30 ? Math.abs(px - X(o.r)) : Math.abs(py - rowY[i]) * 3 + Math.abs(px - X(o.imp)) * 0.2;
        if (dd < dist) { dist = dd; best = i; }
      });
      pick(dist < 60 ? best : -1);
    }
    // a pointer that hovers picks as it moves; a finger picks where it taps, and the pick stays
    stage.addEventListener("pointermove", function (e) { if (e.pointerType !== "touch") pickAt(e); });
    stage.addEventListener("pointerdown", pickAt);
    stage.addEventListener("pointerleave", function (e) { if (e.pointerType !== "touch") pick(-1); });

    setView(true);
    readout(-1);
    if (motion) Lux.onVisible(box, function () { box.classList.add("is-in"); }, 0.3);
    else box.classList.add("is-in");
    var rt = 0;
    window.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(draw, 120); });
    // the labels are placed by their measured widths: measure again once the site's fonts are in
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { W = 0; draw(); });
    if (window.MutationObserver) {
      new MutationObserver(function () { readout(picked); }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    }
  })();

  /* =====================================================================
     Method: the four steps, running
     The newest tests go through the four steps one after another: the change's
     title, the three builds, the games counted to their total while the interval
     closes in on the result, then the verdict. Every number is the strip's own; the
     interval narrows as one over the square root of the games, as an interval does,
     and only its final width is a measured one.
     ===================================================================== */
  (function machine() {
    var pipe = $(".pipe"), strip = $("[data-strip]");
    if (!pipe || !strip) return;
    var steps = $$(":scope > li", pipe);
    if (steps.length !== 4) return;
    function num(s) { return parseInt(String(s).replace(/[,\s]/g, ""), 10) || 0; }
    function fmt(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
    var bars = $$(".sbar", strip);
    var runs = bars.map(function (b) {
      var m = /([+−-]?\d+(?:\.\d+)?)\s*±\s*(\d+(?:\.\d+)?)/.exec(b.getAttribute("data-text") || "");
      var label = b.getAttribute("data-label") || "", cut = label.search(/[;,]/);
      return {
        n: b.getAttribute("data-test"), title: b.getAttribute("data-title") || "", text: b.getAttribute("data-text") || "",
        e: m ? parseFloat(m[1].replace("−", "-")) : 0, ci: m ? parseFloat(m[2]) : 0, games: num(b.getAttribute("data-games")),
        word: cut > 0 ? label.slice(0, cut) : label, rest: cut > 0 ? label.slice(cut + 1).trim() : "",
        kind: b.classList.contains("is-pass") ? "pass" : b.classList.contains("is-fail") ? "fail" : b.classList.contains("is-merged") ? "merged" : "stop",
        bar: b
      };
    }).reverse();                                         // newest first
    if (!runs.length) return;
    var CYCLE = Math.min(8, runs.length);

    function live(li, cls) { var d = el("div", "pipe-live " + cls); d.setAttribute("aria-hidden", "true"); li.appendChild(d); return d; }
    var L1 = live(steps[0], "pl-pr"), prNo = el("span", "pl-k"), prTitle = el("span", "pl-title");
    L1.appendChild(prNo); L1.appendChild(prTitle);
    var L2 = live(steps[1], "pl-build"), chips = ["Linux", "Windows", "macOS"].map(function (s) { var c = el("span", "pl-chip", s); L2.appendChild(c); return c; });
    var L3 = live(steps[2], "pl-sprt"), gEl = el("span", "pl-games num"), meter = el("span", "pl-meter"), eloEl = el("span", "pl-elo num");
    var mZero = el("i", "pl-zero"), mCi = el("i", "pl-ci"), mDot = el("i", "pl-dot"), mLo = el("span", "pl-lo"), mHi = el("span", "pl-hi");
    [mZero, mCi, mDot, mLo, mHi].forEach(function (n) { meter.appendChild(n); });
    L3.appendChild(gEl); L3.appendChild(meter); L3.appendChild(eloEl);
    var L4 = live(steps[3], "pl-verdict"), vWord = el("span", "pl-word"), vRest = el("span", "pl-rest");
    L4.appendChild(vWord); L4.appendChild(vRest);
    var wire = el("i", "pipe-wire");
    wire.setAttribute("aria-hidden", "true");
    pipe.appendChild(wire);
    pipe.classList.add("is-live");
    var hint = el("p", "try pipe-try");
    hint.setAttribute("aria-hidden", "true");
    [["try-n", "03 · To try"], ["", "Point at a bar in the strip below"], ["", "·"], ["", "the four steps run that test"]]
      .forEach(function (h) { hint.appendChild(el("span", h[0], h[1])); });
    pipe.parentNode.insertBefore(hint, pipe.nextSibling);

    // the steps' starts, and the end of a run, in ms
    var T = [0, 1900, 3300, 6500, 9400];
    var run = null, cur = 0, t0 = 0, raf = 0, on = false, paused = 0;
    function nice(v) { var s = [5, 10, 20, 40, 80, 160, 320]; for (var i = 0; i < s.length; i++) if (v <= s[i]) return s[i]; return s[s.length - 1]; }
    function load(k) {
      cur = k; run = runs[k];
      prNo.textContent = "Test " + run.n;
      var R = nice(Math.abs(run.e) + run.ci + 1);
      run.R = R;
      mLo.textContent = "−" + R; mHi.textContent = "+" + R;
      meter.style.setProperty("--z", "50%");
      meter.style.setProperty("--d", (50 + run.e / R * 50).toFixed(2) + "%");
      pipe.setAttribute("data-kind", run.kind);
      runs.forEach(function (r) { r.bar.classList.remove("is-hot"); });
      run.bar.classList.add("is-hot");
    }
    function render(t) {
      var step = t < T[1] ? 0 : t < T[2] ? 1 : t < T[3] ? 2 : 3;
      steps.forEach(function (li, i) { li.classList.toggle("is-run", i === step); li.classList.toggle("is-done", i < step); });
      // the light along the wire: through each step in its time
      var p = step + clamp((t - T[step]) / (T[step + 1] - T[step]), 0, 1);
      wire.style.setProperty("--p", (p / 4).toFixed(4));
      // 1: the change, typed
      var f1 = clamp(t / (T[1] - 400), 0, 1);
      prTitle.textContent = run.title.slice(0, Math.round(run.title.length * f1));
      L1.classList.toggle("is-typing", f1 < 1 && step === 0);
      // 2: the builds, one after another
      chips.forEach(function (c, i) { c.classList.toggle("is-lit", t > T[1] + 260 + i * 340); });
      // 3: the games counted; the interval closes in as their square root grows
      var f3 = clamp((t - T[2]) / (T[3] - T[2] - 500), 0, 1), ease = 1 - Math.pow(1 - f3, 2.2);
      var g = Math.max(1, Math.round(run.games * ease));
      gEl.textContent = t < T[2] ? "" : fmt(g) + " games";
      var half = run.ci * Math.sqrt(run.games / Math.max(g, run.games * 0.004));
      var a = clamp(50 + (run.e - half) / run.R * 50, 0, 100), b = clamp(50 + (run.e + half) / run.R * 50, 0, 100);
      meter.style.setProperty("--a", a.toFixed(2) + "%");
      meter.style.setProperty("--b", b.toFixed(2) + "%");
      L3.classList.toggle("is-on", t >= T[2]);
      eloEl.textContent = f3 >= 1 ? run.text + " Elo" : "";
      // 4: the verdict
      var shown = t >= T[3] + 150;
      vWord.textContent = shown ? run.word : "";
      vRest.textContent = shown ? run.rest : "";
      L4.classList.toggle("is-on", shown);
    }
    function frame(now) {
      raf = 0;
      if (!on) return;
      var t = now - t0;
      if (t >= T[4]) { load((cur + 1) % CYCLE); t0 = now; t = 0; }
      render(t);
      raf = requestAnimationFrame(frame);
    }
    function start(k) {
      load(k);
      t0 = performance.now();
      if (!raf && on) raf = requestAnimationFrame(frame);
    }

    if (!motion) {                                        // still: the newest test, all four steps done
      load(0);
      render(T[4] - 1);
      steps.forEach(function (li) { li.classList.remove("is-run"); li.classList.add("is-done"); });
      return;
    }
    load(0);
    render(0);
    Lux.whileVisible(pipe, function (v) {
      if (v === on) return;
      on = v;
      if (v) { t0 = performance.now() - paused; if (!raf) raf = requestAnimationFrame(frame); }
      else { paused = performance.now() - t0; if (raf) { cancelAnimationFrame(raf); raf = 0; } }
    }, 0.2);
    // a bar of the strip, pointed at, runs through the steps
    bars.forEach(function (b, i) {
      b.addEventListener("pointerenter", function () { if (on) start(runs.length - 1 - i); });
      b.addEventListener("focus", function () { if (on) start(runs.length - 1 - i); });
    });
  })();
})();
