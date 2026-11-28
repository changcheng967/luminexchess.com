/* luminexchess.com: the engine page's opening, a search growing in light.

   The tree is drawn, not recorded: no engine stores every node it visits. What drives it is real:
   the first search in think.json (v6.7.0 on 28...Bh5 against PlentyChess b-v8.0.0). Each of its
   iterations adds a level, at the pace the engine reached it; the root's bright branch is the
   engine's best move of the moment, so the light jumps when the engine changes its mind (at
   depth 17 the bishop to h5 comes back for good); the counter under the tree is the engine's own.
   Without motion the finished tree is drawn once. */
(function () {
  "use strict";

  var Lux = window.Lux;
  var canvas = document.querySelector("[data-hero-tree]");
  if (!Lux || !canvas || !canvas.getContext || !window.fetch) return;
  var ctx = canvas.getContext("2d"), motion = Lux.motion;
  var readEl = document.querySelector("[data-hero-read]");

  function rng(seed) {                                   // mulberry32: the same tree every visit
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  var S = null, iters = [], nodes = [], roots = {}, W = 0, H = 0, dpr = 1, col = {};
  var t0 = 0, built = false, raf = 0, visible = true, pointer = null, pulse = 0;

  function colours() {
    var cs = getComputedStyle(document.documentElement);
    function v(n, f) { return (cs.getPropertyValue(n) || "").trim() || f; }
    col = { lumen: v("--lumen-rgb", "111, 230, 245"), violet: v("--violet-rgb", "163, 156, 245"), opp: v("--opp-rgb", "242, 179, 90"), ink: v("--ink", "#edf3ff") };
  }

  // the tree: one branch for each move the engine ever called best at the root, others around them
  function grow() {
    var rand = rng(20261124), depthMax = iters[iters.length - 1].depth, bestSeen = [];
    iters.forEach(function (l) { if (bestSeen.indexOf(l.pv[0]) < 0) bestSeen.push(l.pv[0]); });
    var rootN = Math.max(7, bestSeen.length + 3), list = [], cx = W * 0.58, top = H * 0.12, bottom = H * 0.96;
    function y(d) { return top + (bottom - top) * Math.pow(d / depthMax, 0.78); }
    var root = { x: cx, y: top, d: 0, kids: [] };
    list.push(root);
    var slots = [];
    for (var i = 0; i < rootN; i++) slots.push(i);
    // the moves that were best take the middle slots, in the order the engine found them
    var mid = Math.floor(rootN / 2);
    bestSeen.forEach(function (mv, k) { roots[mv] = mid + (k % 2 ? 1 : -1) * Math.ceil(k / 2); });
    for (i = 0; i < rootN; i++) {
      var a = (i - (rootN - 1) / 2) / ((rootN - 1) / 2);
      var n = { x: cx + a * W * 0.26, y: y(1), d: 1, parent: root, slot: i, kids: [], prune: 0, rnd: rand(), hot: false };
      root.kids.push(n); list.push(n);
    }
    Object.keys(roots).forEach(function (mv) { root.kids[roots[mv]].hot = true; });
    var frontier = root.kids.slice(), cap = 2400;
    for (var d = 2; d <= depthMax && list.length < cap; d++) {
      var next = [], spread = W * 0.34 * Math.pow(0.86, d);
      frontier.forEach(function (p) {
        var hot = p.hot, kids = hot ? 2 : (rand() < 0.35 ? 2 : 1);
        if (!hot && rand() < 0.10 + d * 0.012) { p.prune = 1; return; }      // a branch that cannot matter stops
        for (var k = 0; k < kids && list.length < cap; k++) {
          var c = { x: p.x + (rand() - 0.5) * spread * 2, y: y(d) + (rand() - 0.5) * 6, d: d, parent: p, slot: p.slot, kids: [], prune: 0, rnd: rand(), hot: hot && k === 0 };
          c.x = Math.max(W * 0.03, Math.min(W * 0.97, c.x));
          p.kids.push(c); list.push(c); next.push(c);
        }
      });
      frontier = next;
    }
    nodes = list;
  }
  // the line of the moment: from the root's branch for the best move, the first child at every level
  function pvOf(slot, depth) {
    var path = [], n = null, root = nodes[0];
    root.kids.forEach(function (k) { if (k.slot === slot) n = k; });
    while (n && n.d <= depth) { path.push(n); n = n.kids[0]; }
    return path;
  }

  function size() {
    var r = canvas.getBoundingClientRect();
    if (r.width < 40 || r.height < 40) return false;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = r.width; H = r.height;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (iters.length) grow();
    return true;
  }

  // where the search is at `ms`: the iteration reached, the engine's counters
  function at(ms) {
    var k = -1;
    for (var i = 0; i < iters.length; i++) if (iters[i].time <= ms) k = i;
    return k;
  }
  // the build runs over 7 s whatever the real time, early iterations stretched so each is seen
  var BUILD = 7000;
  function realTime(p) { var end = iters[iters.length - 1].time; return Math.pow(p, 2.2) * end; }

  function draw(now) {
    if (!nodes.length || W < 40) return;
    var p = built ? 1 : Math.min(1, (now - t0) / BUILD), ms = realTime(p), k = at(ms);
    var l = k >= 0 ? iters[k] : null, depth = l ? l.depth : 0;
    ctx.clearRect(0, 0, W, H);
    var slot = l ? roots[l.pv[0]] : -1, pv = l ? pvOf(slot, depth) : [], onPv = {};
    pv.forEach(function (n) { onPv[nodes.indexOf(n)] = true; });
    // every branch the search has reached
    for (var i = 1; i < nodes.length; i++) {
      var n = nodes[i];
      if (n.d > depth) continue;
      var near = pointer ? Math.max(0, 1 - Math.hypot(n.x - pointer.x, n.y - pointer.y) / 140) : 0;
      var a = (n.prune ? 0.05 : 0.12) + 0.05 * n.rnd + near * 0.45;
      if (onPv[i]) continue;
      ctx.strokeStyle = "rgba(" + (n.slot === slot ? col.lumen : col.violet) + "," + a.toFixed(3) + ")";
      ctx.lineWidth = n.slot === slot ? 1 : 0.7;
      ctx.beginPath(); ctx.moveTo(n.parent.x, n.parent.y); ctx.lineTo(n.x, n.y); ctx.stroke();
      if (n.d === depth && !n.prune) {                   // the frontier: a square of light where the search stands
        ctx.fillStyle = "rgba(" + col.lumen + "," + (0.25 + near * 0.6).toFixed(3) + ")";
        ctx.fillRect(n.x - 1.5, n.y - 1.5, 3, 3);
      }
    }
    // the best line, bright, with its glow
    if (pv.length) {
      ctx.save();
      ctx.shadowColor = "rgba(" + col.lumen + ",0.9)"; ctx.shadowBlur = 14;
      ctx.strokeStyle = "rgba(" + col.lumen + ",0.95)"; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(nodes[0].x, nodes[0].y);
      pv.forEach(function (n) { ctx.lineTo(n.x, n.y); });
      ctx.stroke();
      var tip = pv[pv.length - 1];
      ctx.fillStyle = "rgba(" + col.lumen + ",1)";
      ctx.fillRect(tip.x - 4, tip.y - 4, 8, 8);
      // a pulse running down the line once the search is done
      if (built && motion) {
        var q = (pulse % 2400) / 2400, idx = Math.floor(q * pv.length), m = pv[Math.min(idx, pv.length - 1)];
        ctx.shadowBlur = 22;
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.fillRect(m.x - 2.5, m.y - 2.5, 5, 5);
      }
      ctx.restore();
    }
    // the root: the position on the board
    ctx.fillStyle = col.ink;
    ctx.fillRect(nodes[0].x - 5, nodes[0].y - 5, 10, 10);
    if (readEl && l) readEl.textContent = "depth " + l.depth + " · " + l.nodes.toLocaleString("en-US") + " nodes · best " + l.san[0] + " " + score(l);
    if (!built && p >= 1) built = true;
  }
  function score(l) {
    if (l.mate !== undefined) return "mate " + l.mate;
    return (l.cp > 0 ? "+" : l.cp < 0 ? "−" : "") + Math.abs(l.cp / 100).toFixed(2);
  }
  function loop(now) {
    raf = 0;
    if (!visible) return;
    pulse = now;
    draw(now);
    if (!built || pointer || motion) raf = requestAnimationFrame(loop);
  }
  function kick() { if (!raf && visible) raf = requestAnimationFrame(loop); }

  fetch("/assets/data/think.json", { credentials: "same-origin" })
    .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
    .then(function (data) {
      S = data.searches[0];
      var byDepth = {};
      S.lines.forEach(function (l) { byDepth[l.depth] = l; });
      iters = Object.keys(byDepth).map(Number).sort(function (a, b) { return a - b; }).map(function (d) { return byDepth[d]; });
      colours();
      if (!motion) built = true;
      var started = false;
      function fit() {
        if (!size()) return;
        canvas.classList.add("is-live");
        if (!started) { started = true; t0 = performance.now(); }
        if (!motion) draw(performance.now()); else kick();
      }
      if ("ResizeObserver" in window) new ResizeObserver(fit).observe(canvas);
      else window.addEventListener("resize", fit);
      fit();
      if (!motion) return;
      if ("IntersectionObserver" in window) {
        new IntersectionObserver(function (es) {
          visible = es[es.length - 1].isIntersecting;   // the last entry is where it is now
          if (visible) kick();
        }).observe(canvas);
      }
      var hero = canvas.parentNode;
      hero.addEventListener("pointermove", function (e) {
        var r = canvas.getBoundingClientRect();
        pointer = { x: e.clientX - r.left, y: e.clientY - r.top };
        kick();
      });
      hero.addEventListener("pointerleave", function () { pointer = null; kick(); });
      new MutationObserver(function () { colours(); kick(); }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    })
    .catch(function () {});
})();
