/* luminexchess.com: the clock, as the engine reads it (the engine page).

   The engine's own time manager, at its defaults (search.cpp on main: TimeSchedule 2,
   TimeStability 1, TimeZeroInc 1, Move Overhead 30 ms, no clock lag measured yet), run on
   a game the visitor sets: a time control, a move, and how long the best move has held.
   Every number is integer milliseconds computed as the C++ computes it. The game itself
   is a model: each move spends its average share, the plan divided by 1.16 (the stop
   rule spends about 0.86 of the plan on average), and the increment comes back. */
(function () {
  "use strict";

  var Lux = window.Lux;
  var root = document.querySelector("[data-clocksim]");
  if (!Lux || !root) return;
  var $ = Lux.$, $$ = Lux.$$;
  var OVERHEAD = 30, MOVES = 120;
  var STAB = [240, 170, 140, 105, 90, 90, 50];          // the soft limit, % of the plan, by iterations held

  /* ---------- the engine's formulas ---------- */
  var AT = [8, 23, 40, 65, 100], BV = [1.25, 1.55, 0.80, 0.60, 0.60];
  function value(k) {
    if (k <= AT[0]) return BV[0];
    for (var i = 1; i < 5; i++) if (k <= AT[i]) return BV[i - 1] + (BV[i] - BV[i - 1]) * (k - AT[i - 1]) / (AT[i] - AT[i - 1]);
    return BV[4];
  }
  function survive(j) { return 1 - 0.032 * Math.min(1, Math.max(0, (j - 20) / 50)); }
  function valueHorizon(m) {                             // to the end of the game (last = 0)
    m = Math.max(1, m);
    var h = 0, s = 1, vm = value(m);
    for (var j = m; j <= m + 400 && s > 1e-4; j++) { h += s * value(j) / vm; s *= survive(j); }
    return Math.max(1, h);
  }
  function movesHorizon(m) {
    m = Math.max(1, m);
    var h = 0, s = 1;
    for (var j = m; j <= m + 400 && s > 1e-4; j++) { h += s; s *= survive(j); }
    return h;
  }
  var t = Math.trunc;
  function budget(clock, inc, move) {
    var ideal, max, target, lag = 0;
    if (inc > 0) {                                       // the solved schedule
      var excess = Math.max(0, clock - OVERHEAD - 10 * inc);
      var horizon = Math.max(1000, 4200 - 120 * move);
      target = t(excess * 100 / horizon) + t(inc * 9 / 10);
      var hard = t(excess / 2) + t(inc * 9 / 10);
      ideal = Math.min(t(target * 116 / 100), hard);
      max = Math.min(hard, Math.max(ideal * 2, inc + 50));
    } else {                                             // no increment: the value-weighted horizon
      var tail = Math.max(1000, 30 * OVERHEAD, t(1000 * (12 + lag) / 12));
      var ex = Math.max(0, clock - OVERHEAD - tail - t(lag * movesHorizon(move)));
      target = t(ex / valueHorizon(move));
      var h2 = t(ex / 2);
      ideal = Math.min(t(target * 116 / 100), h2);
      max = Math.min(h2, Math.max(ideal * 2, 50));
    }
    ideal = Math.max(10, ideal);
    max = Math.max(ideal, max);
    var cap = Math.max(1, clock - OVERHEAD);
    return { ideal: Math.min(ideal, cap), max: Math.min(max, cap), target: target };
  }
  function soft(ideal, held, decided) {
    var s = t(ideal * STAB[Math.min(held, 6)] / 100);
    return decided ? t(s / 2) : s;
  }
  // the model game: the clock before each own move, the plan and the spend
  function game(base, inc) {
    var out = [], clock = base;
    for (var m = 1; m <= MOVES; m++) {
      var b = budget(clock, inc, m), spend = Math.min(b.max, Math.max(10, t(b.ideal * 100 / 116)));
      out.push({ move: m, clock: clock, ideal: b.ideal, max: b.max, spend: spend });
      clock = Math.max(0, clock - spend) + inc;
    }
    return out;
  }

  /* ---------- the controls ---------- */
  var baseIn = $('[data-cs="base"]', root), incIn = $('[data-cs="inc"]', root), moveIn = $('[data-cs="move"]', root);
  var decidedIn = $('[data-cs="decided"]', root), heldBtns = $$("[data-held]", root), presetBtns = $$("[data-tc]", root);
  var out = {};
  $$("[data-cs-out]", root).forEach(function (el) { out[el.getAttribute("data-cs-out")] = el; });
  var curve = $("[data-cs-curve]", root), bar = $("[data-cs-bar]", root), noteEl = $("[data-cs-note]", root);
  if (!baseIn || !incIn || !moveIn || !curve || !bar) return;
  var held = 0;
  // the sliders step through clocks people play: 10 s to 90 min, and no increment to 30 s
  var BASES = [10000, 15000, 20000, 30000, 45000, 60000, 90000, 120000, 180000, 300000, 600000, 900000, 1200000, 1800000, 2700000, 3600000, 5400000];
  var INCS = [0, 10, 50, 100, 200, 300, 500, 600, 1000, 2000, 3000, 5000, 10000, 15000, 30000];
  baseIn.max = BASES.length - 1; incIn.max = INCS.length - 1;
  function baseMs() { return BASES[+baseIn.value]; }
  function incMs() { return INCS[+incIn.value]; }
  function setBase(ms) { baseIn.value = Math.max(0, BASES.indexOf(ms)); }
  function setInc(ms) { incIn.value = Math.max(0, INCS.indexOf(ms)); }
  function secs(ms) {
    if (ms >= 60000) { var m = Math.floor(ms / 60000), s = Math.round((ms % 60000) / 1000); return m + " min" + (s ? " " + s + " s" : ""); }
    if (ms >= 10000) return (ms / 1000).toFixed(0) + " s";
    if (ms >= 1000) return (ms / 1000).toFixed(1) + " s";
    return ms + " ms";
  }
  function tcName(base, inc) {
    var b = base >= 60000 && base % 60000 === 0 ? base / 60000 + "" : (base / 1000) + "";
    var unit = base >= 60000 && base % 60000 === 0 ? "min" : "s";
    return b + " " + unit + " + " + (inc / 1000) + " s";
  }

  /* ---------- drawing ---------- */
  var SVGNS = "http://www.w3.org/2000/svg";
  function node(tag, attrs, cls) {
    var n = document.createElementNS(SVGNS, tag);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (cls) n.setAttribute("class", cls);
    return n;
  }
  function clear(svg) { while (svg.firstChild) svg.removeChild(svg.firstChild); }

  // the plan for every move of the model game; the chosen move lit
  function drawCurve(g, m) {
    clear(curve);
    var W = 600, H = 170, L = 44, R = 10, T = 12, B = 26;
    var top = 0;
    g.forEach(function (p) { top = Math.max(top, p.ideal); });
    top = niceTop(top);
    function x(move) { return L + (move - 1) * (W - L - R) / (MOVES - 1); }
    function y(ms) { return T + (H - T - B) * (1 - ms / top); }
    [0, 0.5, 1].forEach(function (f) {                   // three grid lines, labelled
      var v = top * f;
      curve.appendChild(node("line", { x1: L, x2: W - R, y1: y(v), y2: y(v) }, "cs-gl"));
      var lab = node("text", { x: L - 8, y: y(v) + 4, "text-anchor": "end" }, "cs-axis");
      lab.textContent = v >= 1000 ? (v / 1000).toFixed(v % 1000 ? 1 : 0) + " s" : Math.round(v) + " ms";
      curve.appendChild(lab);
    });
    [1, 20, 40, 60, 80, 100, 120].forEach(function (mv) {
      var lab = node("text", { x: x(mv), y: H - 6, "text-anchor": "middle" }, "cs-axis");
      lab.textContent = mv === 1 ? "move 1" : mv;
      curve.appendChild(lab);
    });
    var area = "M" + x(1) + " " + y(0), line = "";
    g.forEach(function (p, i) {
      area += "L" + x(p.move).toFixed(1) + " " + y(p.ideal).toFixed(1);
      line += (i ? "L" : "M") + x(p.move).toFixed(1) + " " + y(p.ideal).toFixed(1);
    });
    area += "L" + x(MOVES) + " " + y(0) + "Z";
    curve.appendChild(node("path", { d: area }, "cs-area"));
    curve.appendChild(node("path", { d: line }, "cs-line"));
    var p = g[m - 1];
    curve.appendChild(node("line", { x1: x(m), x2: x(m), y1: T, y2: y(0) }, "cs-now"));
    curve.appendChild(node("circle", { cx: x(m), cy: y(p.ideal), r: 5 }, "cs-dot"));
  }
  function niceTop(v) {
    var steps = [100, 200, 250, 400, 500, 800, 1000, 1500, 2000, 2500, 4000, 5000, 8000, 10000, 15000, 20000, 30000, 40000, 60000, 90000, 120000];
    for (var i = 0; i < steps.length; i++) if (v <= steps[i]) return steps[i];
    return Math.ceil(v / 60000) * 60000;
  }

  // the move's time line: where it stops, by how long the best move has held
  function drawBar(p, decided) {
    clear(bar);
    var W = 600, H = 96, L = 6, R = 6, top = p.max;
    function x(ms) { return L + (W - L - R) * Math.min(1, ms / top); }
    var mid = 46;
    bar.appendChild(node("rect", { x: L, y: mid - 7, width: W - L - R, height: 14, rx: 7 }, "cs-track"));
    var stop = Math.min(soft(p.ideal, held, decided), p.max);
    bar.appendChild(node("rect", { x: L, y: mid - 7, width: Math.max(14, x(stop) - L), height: 14, rx: 7 }, "cs-fill"));
    for (var h = 0; h <= 6; h++) {                       // every rung of the stop rule
      var s = Math.min(soft(p.ideal, h, decided), p.max), on = h === held;
      bar.appendChild(node("line", { x1: x(s), x2: x(s), y1: mid - 16, y2: mid + 16 }, on ? "cs-tick is-on" : "cs-tick"));
      if (h === 0 || h === 3 || h === 6 || on) {
        var lab = node("text", { x: x(s), y: mid - 22, "text-anchor": "middle" }, on ? "cs-rung is-on" : "cs-rung");
        lab.textContent = h === 6 ? "6+" : String(h);
        bar.appendChild(lab);
      }
    }
    var ideal = node("text", { x: x(p.ideal), y: mid + 34, "text-anchor": "middle" }, "cs-mark");
    ideal.textContent = "plan " + secs(p.ideal);
    bar.appendChild(node("line", { x1: x(p.ideal), x2: x(p.ideal), y1: mid + 9, y2: mid + 22 }, "cs-planline"));
    bar.appendChild(ideal);
    var hard = node("text", { x: Math.min(x(p.max), W - 4), y: mid + 34, "text-anchor": "end" }, "cs-mark cs-hard");
    hard.textContent = "hard limit " + secs(p.max);
    bar.appendChild(hard);
  }

  function update() {
    var base = baseMs(), inc = incMs(), m = +moveIn.value, decided = !!(decidedIn && decidedIn.checked);
    var g = game(base, inc), p = g[m - 1];
    var stop = Math.min(soft(p.ideal, held, decided), p.max);
    if (out.base) out.base.textContent = secs(base);
    if (out.inc) out.inc.textContent = inc ? (inc / 1000).toFixed(inc % 1000 ? (inc % 100 ? 2 : 1) : 0) + " s" : "none";
    if (out.move) out.move.textContent = "move " + m;
    if (out.clock) out.clock.textContent = secs(p.clock);
    if (out.plan) out.plan.textContent = secs(p.ideal);
    if (out.stop) out.stop.textContent = secs(stop);
    if (out.hard) out.hard.textContent = secs(p.max);
    if (out.rule) out.rule.textContent = inc > 0 ? "the solved schedule: the clock above ten increments, over max(10, 42 − 1.2 × move) moves, plus 0.9 of the increment"
                                                 : "no increment: the clock above a 1 s reserve, over the moves still expected, each weighted by what time is worth there";
    heldBtns.forEach(function (b) { b.setAttribute("aria-pressed", +b.getAttribute("data-held") === held ? "true" : "false"); });
    presetBtns.forEach(function (b) {
      var tc = b.getAttribute("data-tc").split("+");
      b.setAttribute("aria-pressed", +tc[0] * 1000 === base && Math.round(+tc[1] * 1000) === inc ? "true" : "false");
    });
    if (noteEl) noteEl.textContent = "At " + tcName(base, inc) + ", move " + m + " starts with " + secs(p.clock) + " on the clock. The engine plans " + secs(p.ideal) +
      "; with the best move " + (held === 0 ? "just changed" : "held for " + (held === 6 ? "six iterations or more" : held + (held === 1 ? " iteration" : " iterations"))) +
      (decided ? " and the game decided" : "") + (stop >= p.max ? ", it may use all of it, up to the hard limit of " + secs(p.max) + "."
      : ", it starts no iteration after " + secs(stop) + ", and never thinks past " + secs(p.max) + ".");
    drawCurve(g, m);
    drawBar(p, decided);
  }

  [baseIn, incIn, moveIn].forEach(function (el) { el.addEventListener("input", update); });
  if (decidedIn) decidedIn.addEventListener("change", update);
  heldBtns.forEach(function (b) { b.addEventListener("click", function () { held = +b.getAttribute("data-held"); update(); }); });
  presetBtns.forEach(function (b) {
    b.addEventListener("click", function () {
      var tc = b.getAttribute("data-tc").split("+");
      setBase(+tc[0] * 1000);
      setInc(Math.round(+tc[1] * 1000));
      update();
    });
  });
  setBase(10000);
  setInc(100);
  root.classList.add("is-live");
  update();
})();
