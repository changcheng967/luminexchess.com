/* luminexchess.com: a real search, replayed (the engine page).

   think.json holds searches that main's engine ran on positions from its showcase games, one
   thread, a fixed time: every info line it printed, in order, with the line of play in moves
   as a reader writes them. The replay keeps the engine's own clock: an iteration arrives when
   its time arrives, the node count rolls between the engine's own reports, and the line it
   expects lights the board as arrows, its own moves in light, the replies in amber.

   Without motion the search is shown finished, and every iteration can still be opened. */
(function () {
  "use strict";

  var Lux = window.Lux;
  var root = document.querySelector("[data-think]");
  if (!Lux || !root || !window.fetch || !Lux.Board) return;
  var $ = Lux.$, $$ = Lux.$$, motion = Lux.motion;
  var STAB = [2.4, 1.7, 1.4, 1.05, 0.9, 0.9, 0.5];            // the clock's stop rule, by iterations held

  var tabsEl = $("[data-think-tabs]", root), boardEl = $("[data-think-board]", root);
  var el = {};
  $$("[data-think-out]", root).forEach(function (n) { el[n.getAttribute("data-think-out")] = n; });
  var itersEl = $("[data-think-iters]", root), uciEl = $("[data-think-uci]", root), capEl = $("[data-think-cap]", root);
  var playBtn = $('[data-think-do="play"]', root), againBtn = $('[data-think-do="again"]', root);
  var gauge = $("[data-think-gauge]", root), progress = $("[data-think-progress]", root), scrub = $("[data-think-scrub]", root);
  if (!tabsEl || !boardEl || !itersEl) return;

  var board = new Lux.Board(boardEl, { coords: true });
  var searches = [], S = null, iters = [], shown = -1, t0 = 0, elapsed = 0, playing = false, raf = 0;

  function N(v) { return Math.round(v).toLocaleString("en-US"); }
  function score(l) {
    if (l.mate !== undefined) return l.mate > 0 ? "mate in " + l.mate : "mated in " + (-l.mate);
    if (Math.abs(l.cp) >= 15000) return l.cp > 0 ? "a known win" : "a known loss";
    var p = l.cp / 100;
    return (p > 0 ? "+" : p < 0 ? "−" : "") + Math.abs(p).toFixed(2);
  }
  // how far the score leans to the side to move, 0..1, for the gauge
  function lean(l) {
    if (l.mate !== undefined) return l.mate > 0 ? 1 : 0;
    return 1 / (1 + Math.pow(10, -l.cp / 400));
  }
  function secs(ms) { return ms < 1000 ? ms + " ms" : (ms / 1000).toFixed(ms < 10000 ? 2 : 1) + " s"; }

  /* ---------- one search: its iterations, the last report of each depth ---------- */
  function prepare(s) {
    var byDepth = {}, out = [];
    s.lines.forEach(function (l, i) { l.i = i; byDepth[l.depth] = l; });
    Object.keys(byDepth).map(Number).sort(function (a, b) { return a - b; }).forEach(function (d) { out.push(byDepth[d]); });
    var prevNodes = 0, prevBest = null, held = 0;
    out.forEach(function (l) {
      l.own = Math.max(1, l.nodes - prevNodes);                 // the nodes this iteration searched
      l.change = prevBest !== null && l.pv[0] !== prevBest;     // the best move changed at this depth
      held = prevBest !== null && l.pv[0] === prevBest ? held + 1 : 0;
      l.held = held;
      prevNodes = l.nodes; prevBest = l.pv[0];
    });
    var top = Math.max.apply(null, out.map(function (l) { return Math.log(l.own); }));
    out.forEach(function (l) { l.h = Math.max(0.06, Math.log(l.own) / top); });
    return out;
  }

  /* ---------- drawing ---------- */
  function buildIters() {
    itersEl.textContent = "";
    iters.forEach(function (l) {
      var li = document.createElement("li"), b = document.createElement("span");
      b.className = "ti" + (l.change ? " is-change" : "");
      b.style.setProperty("--h", l.h.toFixed(3));
      var d = document.createElement("span"); d.className = "ti-d"; d.textContent = l.depth;
      b.appendChild(document.createElement("i")); b.appendChild(d);
      li.appendChild(b);
      itersEl.appendChild(li);
    });
    if (scrub) { scrub.max = iters.length - 1; scrub.value = iters.length - 1; }
  }
  function arrows(l) {
    var items = [], plies = Math.min(l.pv.length, 6);
    for (var k = 0; k < plies; k++) {
      var u = l.pv[k], a = sq(u.slice(0, 2)), b = sq(u.slice(2, 4));
      items.push({ a: a, b: b, kind: "arrow", key: k + u, order: k, cls: "pv " + (k % 2 ? "pv-o" : "pv-l") + (k === 0 ? " pv-first" : "") });
    }
    board.light(items);
  }
  function sq(name) { return (8 - (name.charCodeAt(1) - 48)) * 8 + (name.charCodeAt(0) - 97); }
  function uciText(l) {
    return "info depth " + l.depth + (l.seldepth ? " seldepth " + l.seldepth : "") + " score " + (l.mate !== undefined ? "mate " + l.mate : "cp " + l.cp) +
      " nodes " + l.nodes + " nps " + l.nps + " pv " + l.pv.join(" ");
  }
  // show iteration k; with `pinned` the replay's clock jumps to it
  function show(k, pinned) {
    if (k < 0 || k >= iters.length) return;
    var l = iters[k];
    if (k !== shown) {
      shown = k;
      $$(".ti", itersEl).forEach(function (b, i) {
        b.classList.toggle("is-on", i <= k);
        b.classList.toggle("is-now", i === k);
      });
      if (scrub) {
        scrub.value = k;
        scrub.setAttribute("aria-valuetext", "Depth " + l.depth + ": " + score(l) + ", best move " + l.san[0] +
          (l.change ? ", a new best move" : "") + ", " + N(l.nodes) + " nodes");
      }
      if (el.depth) el.depth.textContent = l.depth;
      if (el.seldepth) { el.seldepth.textContent = l.seldepth || ""; el.seldepth.parentNode.hidden = !l.seldepth; }
      if (el.score) el.score.textContent = score(l);
      if (el.best) el.best.textContent = l.san[0];
      if (el.line) el.line.textContent = l.san.join(" ");
      if (el.held) el.held.textContent = l.held === 0 ? (k === 0 ? "the first guess" : "just changed") : "held " + l.held + (l.held === 1 ? " iteration" : " iterations");
      if (el.rule) el.rule.textContent = "× " + STAB[Math.min(l.held, 6)];
      if (gauge) gauge.style.setProperty("--v", lean(l).toFixed(3));
      if (uciEl) {
        var from = Math.max(0, k - 2);
        uciEl.textContent = iters.slice(from, k + 1).map(uciText).join("\n");
      }
      arrows(l);
    }
    if (pinned) { elapsed = l.time; t0 = performance.now() - elapsed; counters(l.time); }
  }
  // the counters between two reports: nodes and time as the engine's own pace gives them
  function counters(ms) {
    var lines = S.lines, a = null, b = null;
    for (var i = 0; i < lines.length; i++) { if (lines[i].time <= ms) a = lines[i]; else { b = lines[i]; break; } }
    var nodes = a ? a.nodes : 0;
    if (a && b && b.time > a.time) nodes = a.nodes + (b.nodes - a.nodes) * (ms - a.time) / (b.time - a.time);
    else if (!a && b) nodes = b.nodes * Math.max(0, ms) / Math.max(1, b.time);
    if (el.nodes) el.nodes.textContent = N(nodes);
    if (el.time) el.time.textContent = secs(Math.round(Math.max(0, Math.min(ms, S.end))));
    if (el.nps) el.nps.textContent = a ? (a.nps / 1e6).toFixed(2) + " million" : "";
    if (progress) progress.style.setProperty("--p", Math.min(1, ms / S.movetime).toFixed(4));
  }

  /* ---------- the replay ---------- */
  function frame() {
    if (!playing) return;
    elapsed = Math.max(0, performance.now() - t0);        // the frame's own timestamp can predate play()
    var k = -1;
    for (var i = 0; i < iters.length; i++) if (iters[i].time <= elapsed) k = i;
    if (k >= 0) show(k, false);
    counters(elapsed);
    if (elapsed >= S.end) { done(); return; }
    raf = requestAnimationFrame(frame);
  }
  function play() {
    if (elapsed >= S.end) { elapsed = 0; shown = -1; }
    playing = true;
    root.classList.add("is-playing");
    if (playBtn) { playBtn.setAttribute("aria-label", "Pause"); $("use", playBtn).setAttribute("href", "#i-pause"); }
    t0 = performance.now() - elapsed;
    raf = requestAnimationFrame(frame);
  }
  function pause() {
    playing = false;
    cancelAnimationFrame(raf);
    root.classList.remove("is-playing");
    if (playBtn) { playBtn.setAttribute("aria-label", "Play"); $("use", playBtn).setAttribute("href", "#i-play"); }
  }
  function done() {
    pause();
    show(iters.length - 1, false);
    counters(S.end);
    if (el.best) el.best.textContent = S.bestSan;
  }
  function choose(i, autoplay) {
    pause();
    S = searches[i];
    iters = prepare(S);
    S.end = Math.max(S.end || 0, iters[iters.length - 1].time, S.lines[S.lines.length - 1].time);
    shown = -1; elapsed = 0;
    $$("[role=tab]", tabsEl).forEach(function (t, k) { t.setAttribute("aria-selected", k === i ? "true" : "false"); t.tabIndex = k === i ? 0 : -1; });
    // the side the engine is thinking for sits at the bottom
    board.instant(function () { board.setFlipped(S.fen.split(" ")[1] === "b"); board.set(S.fen, false); });
    board.mark(S.last || null);
    if (capEl) capEl.textContent = S.story;
    if (el.pos) el.pos.textContent = S.title;
    buildIters();
    if (motion && autoplay) { show(0, true); play(); }
    else done();
  }

  /* ---------- start when the figure comes near ---------- */
  fetch(root.getAttribute("data-src"), { credentials: "same-origin" })
    .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
    .then(function (data) {
      searches = data.searches;
      searches.forEach(function (s, i) {
        var t = document.createElement("button");
        t.type = "button"; t.setAttribute("role", "tab");
        t.className = "think-tab";
        t.textContent = s.tab;
        t.addEventListener("click", function () { choose(i, true); });
        t.addEventListener("keydown", function (e) {
          if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
          var n = (i + (e.key === "ArrowRight" ? 1 : searches.length - 1)) % searches.length;
          tabsEl.children[n].focus(); choose(n, true);
        });
        tabsEl.appendChild(t);
      });
      if (playBtn) playBtn.addEventListener("click", function () { if (playing) pause(); else play(); });
      if (scrub) scrub.addEventListener("input", function () { pause(); show(+scrub.value, true); });
      document.addEventListener("keydown", function (e) {
        if (e.code !== "Space" || e.target.closest("input, button, textarea, select, a, summary, [contenteditable]")) return;
        var r = root.getBoundingClientRect();
        if (r.bottom < 0 || r.top > window.innerHeight) return;
        e.preventDefault();
        if (playing) pause(); else { if (elapsed >= S.end) { elapsed = 0; shown = -1; show(0, true); } play(); }
      });
      // the bars answer the pointer too: press or drag across them
      var dragging = false;
      function pick(e) {
        var r = itersEl.getBoundingClientRect(), k = Math.floor((e.clientX - r.left) / r.width * iters.length);
        pause(); show(Math.max(0, Math.min(iters.length - 1, k)), true);
      }
      itersEl.addEventListener("pointerdown", function (e) { dragging = true; pick(e); });
      itersEl.addEventListener("pointermove", function (e) { if (dragging) pick(e); });
      window.addEventListener("pointerup", function () { dragging = false; });
      if (againBtn) againBtn.addEventListener("click", function () { pause(); elapsed = 0; shown = -1; show(0, true); play(); });
      root.classList.add("is-live");
      choose(0, false);
      if (!motion || !("IntersectionObserver" in window)) return;
      var seen = false;
      new IntersectionObserver(function (es, ob) {
        es.forEach(function (e) {
          if (e.isIntersecting && !seen) { seen = true; ob.disconnect(); choose(0, true); }
        });
      }, { threshold: 0.45 }).observe(root);
    })
    .catch(function () { root.hidden = true; });
})();
