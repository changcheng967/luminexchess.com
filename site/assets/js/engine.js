/* luminexchess.com: the engine page.
   - the search, one idea at a time: the tree stays in place while the six
     steps scroll past, and it shows what has been explained so far;
   - the network: one detail panel for the selected layer;
   - the speed bars grow when they come on screen.
   - the network's generations: what each adds arrives card by card.
   Without scripts the tree is complete and every text is in the page. */
(function () {
  "use strict";

  var Lux = window.Lux;
  if (!Lux) return;
  var $ = Lux.$, $$ = Lux.$$, motion = Lux.motion;

  (function scrolly() {
    var root = $("[data-scrolly]");
    if (!root || !motion) return;
    var fig = $("[data-fig]", root), steps = $$(".step", root), dots = $$(".step-dots a", root);
    var current = 0;
    function set(n) {
      if (n === current) return;
      current = n;
      for (var i = 1; i <= steps.length; i++) {      // s1..sN: ideas shown so far; now-N: the one in focus
        fig.classList.toggle("s" + i, i <= n);
        fig.classList.toggle("now-" + i, i === n);
      }
      steps.forEach(function (li, k) { li.classList.toggle("is-active", k + 1 === n); });
      dots.forEach(function (a, k) {
        if (k + 1 === n) a.setAttribute("aria-current", "step"); else a.removeAttribute("aria-current");
      });
    }
    function focus() {
      var mid = window.innerHeight * 0.52, best = 1, dist = 1e9;
      steps.forEach(function (li, k) {
        var r = li.getBoundingClientRect(), d = Math.abs((r.top + r.bottom) / 2 - mid);
        if (d < dist) { dist = d; best = k + 1; }
      });
      set(best);
    }
    root.classList.add("is-live");
    Lux.scene(root, { mode: "view", onUpdate: focus });
    window.addEventListener("resize", focus);
    focus();
  })();

  (function network() {
    var list = $("[data-net]"), panel = $("#net-detail");
    if (!list || !panel) return;
    var layers = $$(".net-layer", list);
    function select(li, quiet) {
      layers.forEach(function (l) { $(".net-btn", l).setAttribute("aria-pressed", l === li ? "true" : "false"); });
      var strong = document.createElement("strong");
      strong.textContent = $(".net-name", li).textContent + " (" + $(".net-size", li).textContent + "). ";
      panel.textContent = "";
      panel.appendChild(strong);
      panel.appendChild(document.createTextNode($(".net-text", li).textContent));
      if (motion && !quiet) {
        panel.classList.remove("is-swap");
        void panel.offsetWidth;
        panel.classList.add("is-swap");
      }
    }
    layers.forEach(function (li) {
      $(".net-btn", li).addEventListener("click", function () { select(li); });
    });
    list.classList.add("is-live");
    select(layers[1], true);
  })();

  // the speed, felt: what 1.30 million nodes a second adds up to while the page is open
  (function live() {
    var wrap = $("[data-live]"), out = wrap && $("[data-live-nodes]", wrap);
    if (!wrap || !out || !motion) return;
    var rate = 1.30e6, start = performance.now(), raf = 0, on = false;
    function tick(now) {
      raf = 0;
      if (!on) return;
      out.textContent = Math.floor((now - start) / 1000 * rate).toLocaleString("en-US");
      raf = requestAnimationFrame(tick);
    }
    wrap.hidden = false;
    Lux.whileVisible(wrap, function (vis) { on = vis; if (on && !raf) raf = requestAnimationFrame(tick); }, 0);
  })();

  // the runs behind main's network, drawn from the page's own tables: each run a band along the
  // steps, a seam of light where each pass over its data ends, and the SPRT gains as a staircase above
  (function lineage() {
    var fig = $("[data-lineage]"), svg = fig && $("svg", fig), read = fig && $("[data-lineage-read]", fig);
    if (!fig || !svg) return;
    var SVGNS = "http://www.w3.org/2000/svg";
    function num(s) { return +String(s).replace(/[^0-9.]/g, ""); }
    function N(v) { return v.toLocaleString("en-US"); }
    var elo = {};
    $$("#next-network tbody tr").forEach(function (tr) {
      var th = $("th", tr), td = $("td[data-th=Elo]", tr);
      if (th && td) elo[th.textContent.trim()] = td.textContent.trim();
    });
    var runs = [];
    $$(".phases:not(.steps) tbody tr").forEach(function (tr) {
      var name = $("th", tr).textContent.trim(), steps = $("td[data-th=Steps]", tr).textContent.split("→");
      if (/quantization/.test(name) || steps.length < 2) return;
      var id = name.split(",")[0];
      runs.push({ name: id, a: num(steps[0]), b: num(steps[1]), shown: $("td[data-th='Positions shown']", tr).textContent.trim(),
                  from: $("td[data-th='Drawn from']", tr).textContent.trim(), passes: num($("td[data-th=Passes]", tr).textContent),
                  passesText: $("td[data-th=Passes]", tr).textContent.trim(),   // "9.0", or "about 14" where the data is counted from samples
                  elo: elo[id + "q"] || "", row: tr });
    });
    if (!runs.length) return;
    var W = 1000, H = 236, L = 18, R = 18, end = runs[runs.length - 1].b, base = 150, band = 34;
    function x(steps) { return L + (W - L - R) * steps / end; }
    function make(tag, attrs, cls, parent) {
      var n = document.createElementNS(SVGNS, tag);
      for (var k in attrs) n.setAttribute(k, attrs[k]);
      if (cls) n.setAttribute("class", cls);
      (parent || svg).appendChild(n);
      return n;
    }
    // the staircase: each network's SPRT against the one before, added up from gen768s_03q
    var total = 0, top = 0;
    runs.forEach(function (r) { r.gain = parseFloat(r.elo.replace("−", "-")) || 0; total += r.gain; r.sum = total; top = Math.max(top, total); });
    function y(e) { return base - 22 - (base - 56) * e / top; }
    var stair = "M" + x(0) + " " + y(0);
    runs.forEach(function (r) { stair += "L" + x(r.b).toFixed(1) + " " + y(r.sum - r.gain).toFixed(1) + "L" + x(r.b).toFixed(1) + " " + y(r.sum).toFixed(1); });
    make("path", { d: stair }, "lg-stair");
    runs.forEach(function (r, i) {
      var g = make("g", { "data-run": i }, "lg-run"), x0 = x(r.a), x1 = x(r.b);
      g.style.setProperty("--i", i);
      make("rect", { x: x0 + 1, y: base, width: Math.max(2, x1 - x0 - 2), height: band, rx: 4 }, "lg-band", g);
      for (var p = 1; p < r.passes; p++) {
        var sx = x0 + (x1 - x0) * p / r.passes;
        make("line", { x1: sx, x2: sx, y1: base + 6, y2: base + band - 6 }, "lg-seam", g);
      }
      make("text", { x: (x0 + x1) / 2, y: base + band + 22, "text-anchor": "middle" }, "lg-name", g).textContent = r.name.replace("gen768t_", "run ").replace("gen768u_", "V6 run ");
      make("text", { x: x1 - 4, y: y(r.sum) - 9, "text-anchor": "end" }, "lg-gain", g).textContent = r.elo.split(" ")[0];
      make("rect", { x: x0, y: 0, width: x1 - x0, height: H }, "lg-hit", g);
    });
    for (var s = 0; s <= end; s += 2e6) {     // a mark every two million steps, as far as the line goes
      make("text", { x: x(s), y: H - 2, "text-anchor": s ? "middle" : "start" }, "lg-axis").textContent = s ? (s / 1e6) + " million steps" : "step 0";
    }
    function say(i) {
      var r = runs[i];
      $$(".lg-run", svg).forEach(function (g, k) { g.classList.toggle("is-on", k === i); });
      runs.forEach(function (o, k) { o.row.classList.toggle("is-lit", k === i); });
      if (read) read.textContent = r.name + ": steps " + N(r.a) + " → " + N(r.b) + ", " + r.shown + " positions shown, " + r.passesText +
        " passes over " + r.from.replace(/^.*: /, "").replace(/ positions$/, "") + " positions" + (r.elo ? "; its network " + r.elo + " Elo against the one before" : "") + ".";
    }
    $$(".lg-run", svg).forEach(function (g, i) {
      g.addEventListener("pointerenter", function () { say(i); });
      g.addEventListener("click", function () { say(i); });
    });
    fig.classList.add("is-live");
    say(runs.length - 1);
    if (motion) Lux.onVisible(fig, function () { fig.classList.add("is-drawn"); }, 0.3);
    else fig.classList.add("is-drawn");
  })();
})();
