/* luminexchess.com: the network's inputs, lit by the pieces (the engine page).

   White's half of the first layer, indexed as the engine indexes it (featurize.cpp,
   halfka_idx): the board is mirrored so White's king stands on the e to h files,
   the king's square picks one of 32 blocks of 768 inputs, and in the block each
   piece lights one input: its plane (own or the opponent's pawn, knight, bishop,
   rook, queen, king) times 64, plus its square. Stepping through a real game shows
   how few inputs a move changes, and that a king move into another block changes
   them all. */
(function () {
  "use strict";

  var Lux = window.Lux, C = Lux && Lux.cells, CH = Lux && Lux.chess;
  var fig = document.querySelector("[data-inputs]");
  if (!C || !CH || !fig || !window.fetch || !Lux.Board) return;
  var canvas = fig.querySelector(".inputs-canvas"), boardEl = fig.querySelector(".board");
  var readEl = fig.querySelector("[data-in-read]"), posEl = fig.querySelector("[data-in-pos]");
  var playBtn = fig.querySelector('[data-in="play"]');
  if (!canvas || !canvas.getContext || !boardEl || !readEl) return;
  var ctx = canvas.getContext("2d");
  var motion = Lux.motion;

  // the engine's table: oriented king square (a1 = 0) to its block
  var BUCKET = [
    -1, -1, -1, -1, 31, 30, 29, 28, -1, -1, -1, -1, 27, 26, 25, 24,
    -1, -1, -1, -1, 23, 22, 21, 20, -1, -1, -1, -1, 19, 18, 17, 16,
    -1, -1, -1, -1, 15, 14, 13, 12, -1, -1, -1, -1, 11, 10, 9, 8,
    -1, -1, -1, -1, 7, 6, 5, 4, -1, -1, -1, -1, 3, 2, 1, 0];
  var TYPES = "PNBRQK", PLANE = ["pawn", "knight", "bishop", "rook", "queen", "king"];
  // the drawing: blocks laid out like the e to h half of the board, planes six by two in a block
  var PW = 8, GAP = 1, BW = 6 * PW + 5 * GAP, BH = 2 * PW + GAP, BG = 3, FW = 4 * BW + 3 * BG, FH = 8 * BH + 7 * BG;

  var game = null, ply = -1, fens = [], feats = [], timer = 0, playing = false;
  var view = { w: 0, h: 0, cs: 1, x: 0, y: 0 }, pal = null, ink = {}, base = null;
  var flash = null, hoverIdx = -1;

  // a1 = 0 square of a square counted from a8 (as parseFen gives them)
  function a1(sq) { return (sq & 7) + 8 * (7 - (sq >> 3)); }
  // White's inputs in a position: the block, whether the board is mirrored, and every lit input
  function features(fen) {
    var pos = CH.parseFen(fen), ksq = -1, i;
    for (i = 0; i < 64; i++) if (pos[i] === "wK") ksq = a1(i);
    var flip = (ksq & 7) < 4 ? 7 : 0, bucket = BUCKET[ksq ^ flip], list = [];
    for (i = 0; i < 64; i++) {
      var code = pos[i];
      if (!code) continue;
      var p = TYPES.indexOf(code.charAt(1)) * 2 + (code.charAt(0) === "w" ? 0 : 1);
      list.push({ idx: (a1(i) ^ flip) + p * 64 + bucket * 768, sq: i, code: code });
    }
    return { bucket: bucket, flip: flip, ksq: ksq, list: list, set: list.reduce(function (o, f) { o[f.idx] = f; return o; }, {}) };
  }
  // where an input sits in the drawing, in cells
  function cellOf(idx) {
    var b = (idx / 768) | 0, rest = idx - b * 768, p = (rest / 64) | 0, sq = rest & 63;
    var bx = (31 - b) % 4, by = 7 - (((31 - b) / 4) | 0);
    var px = p >> 1, py = p & 1;
    return { x: bx * (BW + BG) + px * (PW + GAP) + (sq & 7), y: by * (BH + BG) + py * (PW + GAP) + (7 - (sq >> 3)), b: b, p: p, sq: sq };
  }
  function blockBox(b) {
    var bx = (31 - b) % 4, by = 7 - (((31 - b) / 4) | 0);
    return { x: bx * (BW + BG), y: by * (BH + BG), w: BW, h: BH };
  }

  /* ---------- drawing ---------- */
  function colours() {
    pal = C.palette(fig);
    ink = { lumen: pal.v("--lumen", "#ffc24b"), ink: pal.v("--ink", "#f4f0e7"), faint: pal.v("--faint", "#77736c"),
            a: pal.v("--cell-loss", "#101217"), b: pal.v("--cell-loss-2", "#171a20"), on: pal.v("--bg-3", "#16191e") };
  }
  // every input, unlit: drawn once a size
  function paintBase() {
    base = base || document.createElement("canvas");
    base.width = canvas.width; base.height = canvas.height;
    var c = base.getContext("2d"), dpr = canvas.width / view.w, cs = view.cs;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, view.w, view.h);
    for (var b = 0; b < 32; b++) {
      for (var p = 0; p < 12; p++) {
        for (var sq = 0; sq < 64; sq++) {
          var at = cellOf(b * 768 + p * 64 + sq);
          c.fillStyle = ((sq & 7) + (sq >> 3)) & 1 ? ink.a : ink.b;
          c.fillRect(view.x + at.x * cs, view.y + at.y * cs, cs, cs);
        }
      }
    }
  }
  function draw(now) {
    var cs = view.cs, f = feats[ply + 1];
    ctx.clearRect(0, 0, view.w, view.h);
    ctx.drawImage(base, 0, 0, view.w, view.h);
    if (!f) return;
    // the block in use
    var bb = blockBox(f.bucket);
    ctx.fillStyle = ink.on;
    ctx.globalAlpha = 0.55;
    ctx.fillRect(view.x + bb.x * cs - 2, view.y + bb.y * cs - 2, bb.w * cs + 4, bb.h * cs + 4);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = ink.lumen; ctx.lineWidth = 1;
    ctx.strokeRect(view.x + bb.x * cs - 2.5, view.y + bb.y * cs - 2.5, bb.w * cs + 5, bb.h * cs + 5);
    var t = flash ? Math.min(1, (now - flash.t0) / 700) : 1;
    // inputs that went dark with the last move: a trace that fades
    if (flash && t < 1) {
      ctx.strokeStyle = ink.faint; ctx.lineWidth = 1;
      flash.off.forEach(function (idx) {
        var at = cellOf(idx);
        ctx.globalAlpha = 1 - t;
        ctx.strokeRect(view.x + at.x * cs - 1.5, view.y + at.y * cs - 1.5, cs + 3, cs + 3);
      });
      ctx.globalAlpha = 1;
    }
    f.list.forEach(function (it) {
      var at = cellOf(it.idx), x = view.x + at.x * cs, y = view.y + at.y * cs;
      var fresh = flash && t < 1 && flash.on[it.idx];
      ctx.fillStyle = "rgba(" + pal.rgb[C.WIN].slice(0, 3).join(",") + "," + (fresh ? 0.45 * (1 - t) + 0.2 : 0.2) + ")";
      var g = cs * (fresh ? 2.6 - 1.4 * t : 1.2);
      ctx.fillRect(x - g, y - g, cs + 2 * g, cs + 2 * g);
      ctx.fillStyle = ink.lumen;
      ctx.fillRect(x, y, cs, cs);
    });
    if (hoverIdx >= 0) {
      var h = cellOf(hoverIdx);
      ctx.strokeStyle = ink.ink; ctx.lineWidth = 1.5;
      ctx.strokeRect(view.x + h.x * cs - 3, view.y + h.y * cs - 3, cs + 6, cs + 6);
    }
    if (flash && t < 1) requestAnimationFrame(draw);
  }
  function size() {
    var w = canvas.clientWidth, dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (!w) return;
    var cs = Math.max(1, Math.floor((w / FW) * 4) / 4), h = Math.ceil(FH * cs);
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    canvas.style.setProperty("--h", h + "px");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    view.w = w; view.h = h; view.cs = cs; view.x = Math.floor((w - FW * cs) / 2); view.y = 0;
    paintBase();
    draw(performance.now());
  }

  /* ---------- words ---------- */
  function moveLabel(k) {
    var white = game.whiteFirst ? k % 2 === 0 : k % 2 === 1;
    return (game.startMove + Math.floor((k + (game.whiteFirst ? 0 : 1)) / 2)) + (white ? "." : "…") + game.plies[k].san;
  }
  function N(v) { return v.toLocaleString("en-US"); }
  function describe(prev, cur, k) {
    if (k < 0) return "The book position: " + cur.list.length + " pieces light " + cur.list.length + " inputs of 24,576, all in the block of the king on " + kingName(cur) + ".";
    var on = cur.list.filter(function (it) { return !prev.set[it.idx]; }).length;
    var off = prev.list.filter(function (it) { return !cur.set[it.idx]; }).length;
    if (cur.bucket !== prev.bucket || cur.flip !== prev.flip) {
      return moveLabel(k) + ": White's king moves to another block. Every input changes, so White's half of the first layer is computed again from all " + cur.list.length + " pieces.";
    }
    return moveLabel(k) + ": " + (on + off) + " inputs change (" + on + " on, " + off + " off). The first layer adds " + on + (on === 1 ? " row" : " rows") + " of weights and subtracts " + off + "; nothing else is recomputed.";
  }
  function kingName(f) { return CH.FILES.charAt(f.ksq & 7) + ((f.ksq >> 3) + 1); }

  /* ---------- stepping ---------- */
  var board = new Lux.Board(boardEl, { coords: true });
  function go(k, animate) {
    k = Math.max(-1, Math.min(game.plies.length - 1, k));
    var prev = feats[ply + 1], cur = feats[k + 1], step = Math.abs(k - ply) === 1;
    ply = k;
    if (animate && step) board.set(fens[k + 1], true); else board.instant(function () { board.set(fens[k + 1], false); });
    if (k < 0) board.mark(null);
    else board.mark(game.plies[k].uci, /[+#]$/.test(game.plies[k].san), game.whiteFirst ? k % 2 === 0 : k % 2 === 1);
    var on = {}, off = [];
    if (prev && step) {
      cur.list.forEach(function (it) { if (!prev.set[it.idx]) on[it.idx] = true; });
      prev.list.forEach(function (it) { if (!cur.set[it.idx]) off.push(it.idx); });
    }
    flash = motion && step ? { t0: performance.now(), on: on, off: off } : null;
    readEl.textContent = describe(feats[k] || cur, cur, k);           // what this move changed
    if (posEl) posEl.textContent = k < 0 ? "Book position" : moveLabel(k);
    hoverIdx = -1;
    requestAnimationFrame(draw);
  }
  function stop() {
    playing = false; clearTimeout(timer);
    if (playBtn) { playBtn.setAttribute("aria-label", "Play"); playBtn.querySelector("use").setAttribute("href", "#i-play"); }
  }
  function play() {
    if (ply >= game.plies.length - 1) go(-1, false);
    playing = true;
    if (playBtn) { playBtn.setAttribute("aria-label", "Pause"); playBtn.querySelector("use").setAttribute("href", "#i-pause"); }
    (function tick() {
      if (!playing) return;
      if (ply >= game.plies.length - 1) { stop(); return; }
      go(ply + 1, true);
      timer = setTimeout(tick, 900);
    })();
  }

  /* ---------- the pointer: a piece on the board points at its input, an input at its piece ---------- */
  function squareUnder(e) {
    var r = boardEl.getBoundingClientRect(), f = Math.floor((e.clientX - r.left) / r.width * 8), k = Math.floor((e.clientY - r.top) / r.height * 8);
    if (f < 0 || f > 7 || k < 0 || k > 7) return -1;
    return board.flipped ? (7 - k) * 8 + (7 - f) : k * 8 + f;
  }
  function explain(it) {
    var at = cellOf(it.idx), side = it.code.charAt(0) === "w" ? "White" : "Black";
    return side + " " + CH.NAMES[it.code.charAt(1)] + " on " + CH.squareName(it.sq) + ": input " + N(it.idx) + " of 24,576 · plane " +
      (at.p & 1 ? "the opponent's " : "own ") + PLANE[at.p >> 1] + ", square " + (at.sq) + ", block " + at.b + " (king on " + kingName(feats[ply + 1]) + ")";
  }
  boardEl.addEventListener("pointermove", function (e) {
    var sq = squareUnder(e), f = feats[ply + 1], it = null;
    if (f && sq >= 0) f.list.forEach(function (x) { if (x.sq === sq) it = x; });
    var idx = it ? it.idx : -1;
    if (idx === hoverIdx) return;
    hoverIdx = idx;
    readEl.textContent = it ? explain(it) : describe(feats[ply], f, ply);
    requestAnimationFrame(draw);
  });
  boardEl.addEventListener("pointerleave", function () {
    if (hoverIdx < 0) return;
    hoverIdx = -1; readEl.textContent = describe(feats[ply] || feats[ply + 1], feats[ply + 1], ply);
    requestAnimationFrame(draw);
  });
  canvas.addEventListener("pointermove", function (e) {
    var r = canvas.getBoundingClientRect(), x = (e.clientX - r.left - view.x) / view.cs, y = (e.clientY - r.top - view.y) / view.cs;
    var f = feats[ply + 1], it = null;
    if (f) f.list.forEach(function (c) { var at = cellOf(c.idx); if (Math.abs(at.x + 0.5 - x) < 2.5 && Math.abs(at.y + 0.5 - y) < 2.5) it = c; });
    var idx = it ? it.idx : -1;
    if (idx === hoverIdx) return;
    hoverIdx = idx;
    readEl.textContent = it ? explain(it) : describe(feats[ply] || f, f, ply);
    requestAnimationFrame(draw);
  });

  fetch(fig.getAttribute("data-src"), { credentials: "same-origin" })
    .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
    .then(function (games) {
      game = games[0];
      fens = [game.startFen].concat(game.plies.map(function (p) { return p.fen; }));
      feats = fens.map(features);
      colours();
      fig.classList.add("is-live");
      size();
      go(-1, false);
      Lux.$$("[data-in]", fig).forEach(function (b) {
        b.addEventListener("click", function () {
          var act = b.getAttribute("data-in");
          if (act === "play") { if (playing) stop(); else play(); return; }
          stop();
          if (act === "prev") go(ply - 1, true);
          else if (act === "next") go(ply + 1, true);
          else if (act === "first") go(-1, false);
          else if (act === "castle") go(20, false);
        });
      });
      var t = 0;
      window.addEventListener("resize", function () { clearTimeout(t); t = setTimeout(size, 150); });
      new MutationObserver(function () { colours(); size(); })
        .observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    })
    .catch(function () { fig.hidden = true; });
})();
