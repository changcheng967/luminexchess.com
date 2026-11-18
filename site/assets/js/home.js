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
})();
