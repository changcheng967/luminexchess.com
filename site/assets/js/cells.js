/* luminexchess.com: cells. One cell is one game: lit for a win, half lit for a
   draw, dark for a loss. This file holds what every field of cells shares: the
   seeded scatter of a run's results, the colours, and the wall of every run.

   Cells are laid out in boards: eight by eight, sixty-four games a board, dark
   and light squares like the real thing.

   Only a run's counts are data. The bench does not keep its games in an order
   that lines up with its counts, so within a run the results are scattered by a
   shuffle seeded with the run's number: the same picture on every visit. */
(function () {
  "use strict";

  var Lux = window.Lux;
  if (!Lux) return;

  var LOSS = 0, DRAW = 1, WIN = 2, TUNE = 3, TUNE_DRAW = 4, GONE = 5;

  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // a run's cells: w wins, d draws and l losses in a fixed scattered order.
  // A tuning run plays two settings of one engine against each other, and a
  // data-generation run plays the engine against itself to make training
  // positions, so their cells say only whether a game was decided.
  function scatter(run) {
    var w = run.w, d = run.d, l = run.l, n = w + d + l, a = new Uint8Array(n), i;
    var tune = run.k === "t" || run.k === "d";
    if (run.k === "u") return new Uint8Array(n).fill(GONE);          // results not kept
    for (i = 0; i < d; i++) a[i] = tune ? TUNE_DRAW : DRAW;
    for (i = d; i < d + w; i++) a[i] = tune ? TUNE : WIN;
    for (i = d + w; i < n; i++) a[i] = tune ? TUNE : LOSS;
    var r = rng(run.id * 7919 + 17);
    for (i = n - 1; i > 0; i--) {
      var j = (r() * (i + 1)) | 0, t = a[i];
      a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /* ---------- colours, read from the stylesheet so both themes are its business ---------- */
  var probe = null;
  function rgba(css) {
    if (!probe) { probe = document.createElement("canvas"); probe.width = probe.height = 1; }
    var c = probe.getContext("2d", { willReadFrequently: true });
    c.clearRect(0, 0, 1, 1);
    c.fillStyle = "#000"; c.fillStyle = css;
    c.fillRect(0, 0, 1, 1);
    var p = c.getImageData(0, 0, 1, 1).data;
    return [p[0], p[1], p[2], p[3]];
  }
  function palette(el) {
    var cs = getComputedStyle(el || document.documentElement);
    function v(name, fallback) { return (cs.getPropertyValue(name) || "").trim() || fallback; }
    // each kind of cell on a light square, then on a dark one
    var css = [v("--cell-loss", "#101217"), v("--cell-draw", "#30291a"), v("--cell-win", "#ffc24b"),
               v("--cell-tune", "#2b3954"), v("--cell-tune-draw", "#151a24"), v("--cell-gone", "#141a2a")];
    var alt = [v("--cell-loss-2", "#16191f"), v("--cell-draw-2", "#372e1c"), css[2],
               v("--cell-tune-2", "#2f3e5b"), v("--cell-tune-draw-2", "#191f2a"), v("--cell-gone-2", "#182035")];
    return { css: css, alt: alt, rgb: css.map(rgba), rgb2: alt.map(rgba), v: v };
  }

  /* ---------- a field: one run's cells, `cols` wide, in rows ---------- */
  function fieldBitmap(cells, cols, pal) {
    var rows = Math.ceil(cells.length / cols);
    var cv = document.createElement("canvas");
    cv.width = cols; cv.height = rows;
    var c = cv.getContext("2d"), img = c.createImageData(cols, rows), px = img.data;
    for (var i = 0; i < cells.length; i++) {
      var x = i % cols, y = (i / cols) | 0;
      var col = ((x + y) & 1 ? pal.rgb2 : pal.rgb)[cells[i]], o = i * 4;
      px[o] = col[0]; px[o + 1] = col[1]; px[o + 2] = col[2]; px[o + 3] = 255;
    }
    c.putImageData(img, 0, 0);
    return cv;
  }

  /* ---------- the wall: every run, in boards of 64 games ----------
     The runs follow each other in the order the bench started them, down a ribbon
     `bpr` boards wide (a run starts on a new row of boards, after an empty one);
     the ribbon is cut into `nc` columns of equal height, like a newspaper's, so the
     wall has the shape of the window it fills. Units are cells: a board is 8, the
     gap between boards 1, between columns `cg`. */
  var B = 8, G = 1, P = B + G;
  function Wall(runs) {
    this.runs = runs;
    this.cells = runs.map(scatter);
    this.boards = runs.map(function (r) { return Math.ceil(r.n / (B * B)); });
    this.total = runs.reduce(function (s, r) { return s + r.n; }, 0);
    this.W = this.H = this.nc = this.bpr = this.hc = this.rw = 0;
    this.cg = 4;
    this.start = [];          // each run's first row of boards on the ribbon
    this.bitmap = null;
  }
  Wall.prototype.rowsFor = function (bpr) {
    var rows = 0;
    for (var i = 0; i < this.boards.length; i++) rows += Math.ceil(this.boards[i] / bpr) + (i ? 1 : 0);
    return rows;
  };
  // the columns and their width that give the wall the window's shape, at about one cell a pixel
  Wall.prototype.fit = function (aspect) {
    var best = null, cg = this.cg;
    for (var bpr = 3; bpr <= 40; bpr++) {
      var rows = this.rowsFor(bpr), rw = bpr * P - G;
      for (var nc = 2; nc <= 60; nc++) {
        var hc = Math.ceil(rows / nc), W = nc * rw + (nc - 1) * cg, H = hc * P - G;
        var err = Math.abs(Math.log((W / H) / aspect)) + 0.002 * Math.abs(bpr - 14);
        if (!best || err < best.err) best = { err: err, bpr: bpr, nc: nc, hc: hc, rw: rw, W: W, H: H };
      }
    }
    return best;
  };
  Wall.prototype.layout = function (aspect, pal) {
    var f = this.fit(aspect), runs = this.runs, i, k;
    this.bpr = f.bpr; this.nc = f.nc; this.hc = f.hc; this.rw = f.rw; this.W = f.W; this.H = f.H;
    var start = [], row = 0;
    for (i = 0; i < runs.length; i++) { start.push(row); row += Math.ceil(this.boards[i] / f.bpr) + 1; }
    this.start = start;

    var cv = this.bitmap || document.createElement("canvas");
    cv.width = this.W; cv.height = this.H;
    var c = cv.getContext("2d"), img = c.createImageData(this.W, this.H), px = img.data, W = this.W;
    for (i = 0; i < runs.length; i++) {
      var cells = this.cells[i], n = cells.length;
      for (k = 0; k < n; k++) {
        var p = this.place(i, k), sq = k & 63;
        var rgb = ((sq & 7) + (sq >> 3)) & 1 ? pal.rgb2[cells[k]] : pal.rgb[cells[k]], o = (p.y * W + p.x) * 4;
        px[o] = rgb[0]; px[o + 1] = rgb[1]; px[o + 2] = rgb[2]; px[o + 3] = 255;
      }
    }
    c.putImageData(img, 0, 0);
    this.bitmap = cv;
    // the lit cells alone, an eighth the size: drawn back large, it is the light they spill
    var k8 = 8, g = this.glow || document.createElement("canvas");
    g.width = Math.ceil(this.W / k8); g.height = Math.ceil(this.H / k8);
    var gc = g.getContext("2d", { willReadFrequently: true });
    gc.imageSmoothingEnabled = true; gc.imageSmoothingQuality = "high";
    gc.clearRect(0, 0, g.width, g.height);
    gc.drawImage(cv, 0, 0, g.width, g.height);
    var gi = gc.getImageData(0, 0, g.width, g.height), gp = gi.data, win = pal.rgb[WIN];
    for (var q = 0; q < gp.length; q += 4) {
      var v = Math.max(0, (gp[q] * 0.6 + gp[q + 1] * 0.4) - 70) / 185;
      gp[q] = Math.min(255, v * win[0]); gp[q + 1] = Math.min(255, v * win[1] * 0.8); gp[q + 2] = Math.min(255, v * win[2] * 0.4); gp[q + 3] = 255;
    }
    gc.putImageData(gi, 0, 0);
    this.glow = g;
    return this;
  };
  // where cell k of run i sits on the wall
  Wall.prototype.place = function (i, k) {
    var b = (k / 64) | 0, w = k & 63, bpr = this.bpr;
    var gr = this.start[i] + ((b / bpr) | 0), col = (gr / this.hc) | 0, rr = gr - col * this.hc;
    return { x: col * (this.rw + this.cg) + (b % bpr) * P + (w & 7), y: rr * P + (w >> 3) };
  };
  // which run, and which of its cells, is at wall cell (x, y); null on a gap
  Wall.prototype.at = function (x, y) {
    if (x < 0 || y < 0 || x >= this.W || y >= this.H) return null;
    var pitch = this.rw + this.cg, col = Math.floor(x / pitch), cx = Math.floor(x - col * pitch);
    if (cx >= this.rw) return null;
    var bc = Math.floor(cx / P), ix = cx - bc * P, rr = Math.floor(y / P), iy = Math.floor(y) - rr * P;
    if (ix >= B || iy >= B) return null;
    var gr = col * this.hc + rr, lo = 0, hi = this.start.length - 1;
    while (lo < hi) { var mid = (lo + hi + 1) >> 1; if (this.start[mid] <= gr) lo = mid; else hi = mid - 1; }
    var k = ((gr - this.start[lo]) * this.bpr + bc) * 64 + iy * 8 + ix;
    if (k >= this.runs[lo].n || gr - this.start[lo] >= Math.ceil(this.boards[lo] / this.bpr)) return null;
    return { index: lo, run: this.runs[lo], cell: k, value: this.cells[lo][k] };
  };
  // the rectangles a run covers on the wall (two when it runs over into the next column)
  Wall.prototype.rects = function (index) {
    var out = [], pitch = this.rw + this.cg, hc = this.hc;
    var a = this.start[index], b = a + Math.ceil(this.boards[index] / this.bpr);
    while (a < b) {
      var col = Math.floor(a / hc), end = Math.min(b, (col + 1) * hc);
      out.push({ x: col * pitch, y: (a - col * hc) * P, w: this.rw, h: (end - a) * P - G });
      a = end;
    }
    return out;
  };
  // the box around several runs that follow each other, kept to the column that holds `anchor`
  Wall.prototype.box = function (indices, anchor) {
    var self = this, x0 = self.rects(anchor)[0].x, y0 = 1e9, y1 = -1;
    indices.forEach(function (i) {
      self.rects(i).forEach(function (r) {
        if (r.x !== x0) return;
        y0 = Math.min(y0, r.y); y1 = Math.max(y1, r.y + r.h);
      });
    });
    return { x: x0, y: y0, w: this.rw, h: y1 - y0 };
  };


  /* ---------- chess: positions and attacks, nothing more ---------- */
  var FILES = "abcdefgh";
  // a placement (the first field of a FEN) as 64 squares from a8 to h1: "wN", "bP" or undefined
  function parseFen(fen) {
    var out = new Array(64), rows = fen.split(" ")[0].split("/");
    for (var r = 0; r < 8; r++) {
      var f = 0, row = rows[r] || "";
      for (var i = 0; i < row.length; i++) {
        var ch = row.charAt(i);
        if (ch >= "1" && ch <= "8") { f += +ch; continue; }
        var up = ch.toUpperCase();
        out[r * 8 + f] = (ch === up ? "w" : "b") + up;
        f++;
      }
    }
    return out;
  }
  // the squares a piece attacks: rays stop at the first piece they meet, as the engine's bitboards have it
  function attacks(pos, sq) {
    var code = pos[sq];
    if (!code) return [];
    var r = sq >> 3, f = sq & 7, out = [], white = code.charAt(0) === "w", p = code.charAt(1);
    function add(dr, df) { var rr = r + dr, ff = f + df; if (rr >= 0 && rr < 8 && ff >= 0 && ff < 8) out.push(rr * 8 + ff); }
    function ray(dr, df) {
      var rr = r + dr, ff = f + df;
      while (rr >= 0 && rr < 8 && ff >= 0 && ff < 8) { out.push(rr * 8 + ff); if (pos[rr * 8 + ff]) break; rr += dr; ff += df; }
    }
    if (p === "P") { add(white ? -1 : 1, -1); add(white ? -1 : 1, 1); }
    else if (p === "N") [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]].forEach(function (d) { add(d[0], d[1]); });
    else if (p === "K") [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]].forEach(function (d) { add(d[0], d[1]); });
    else {
      if (p !== "B") { ray(-1, 0); ray(1, 0); ray(0, -1); ray(0, 1); }
      if (p !== "R") { ray(-1, -1); ray(-1, 1); ray(1, -1); ray(1, 1); }
    }
    return out;
  }
  // the same set as the 64-bit number an engine holds: bit 0 is a1, bit 63 is h8
  function mask(list) {
    var lo = 0, hi = 0;
    list.forEach(function (sq) {
      var bit = (7 - (sq >> 3)) * 8 + (sq & 7);
      if (bit < 32) lo = (lo | (1 << bit)) >>> 0; else hi = (hi | (1 << (bit - 32))) >>> 0;
    });
    function hex(v) { return ("00000000" + v.toString(16)).slice(-8); }
    return "0x" + hex(hi) + hex(lo);
  }
  function squareName(sq) { return FILES.charAt(sq & 7) + (8 - (sq >> 3)); }
  var NAMES = { K: "king", Q: "queen", R: "rook", B: "bishop", N: "knight", P: "pawn" };

  // one run of the bench, in a line: what it was and how it went
  function runLine(r) {
    var N = function (v) { return v.toLocaleString("en-US"); }, n = N(r.n) + " games";
    if (r.k === "u") return n + " of runs since removed from the bench, their results not kept";
    if (r.k === "t") return "Run " + r.id + " · a tuning run" + (r.s === "x" ? ", deleted since" : "") + " · " + n;
    if (r.k === "d") return "Run " + r.id + " · training data: the engine against itself" + (r.s === "x" ? ", deleted since" : "") + " · " + n;
    var wdl = N(r.w) + " won, " + N(r.d) + " drawn, " + N(r.l) + " lost";
    if (r.k === "g") return "Test " + r.id + " · gauntlet, against " + r.t + " · " + wdl;
    if (r.k === "m") return "Test " + r.id + " · a match" + (r.t ? " against " + r.t : "") + (r.s === "x" ? ", deleted since" : "") + " · " + wdl;
    var state = r.s === "p" ? "passed" : r.s === "f" ? "failed" : r.s === "r" ? "running" : r.s === "x" ? "deleted" : "stopped";
    return "Test " + r.id + (r.t ? " · " + r.t : "") + " · " + (r.e ? r.e + " Elo, " : "") + state + " · " + n;
  }
  // where a run can be read in full: its row in the record, or its page on the bench
  function runHref(r, rowExists) {
    if (r.s === "x") return null;
    if (r.k === "s" && rowExists) return "/tests/#t" + r.id;
    return "https://bench.luminexchess.com/" + (r.k === "t" ? "tune" : r.k === "d" ? "datagen" : "test") + "/" + r.id + "/";
  }

  Lux.cells = {
    LOSS: LOSS, DRAW: DRAW, WIN: WIN, TUNE: TUNE, TUNE_DRAW: TUNE_DRAW, GONE: GONE,
    rng: rng, scatter: scatter, rgba: rgba, palette: palette, fieldBitmap: fieldBitmap, Wall: Wall,
    runLine: runLine, runHref: runHref
  };
  Lux.chess = { parseFen: parseFen, attacks: attacks, mask: mask, squareName: squareName, NAMES: NAMES, FILES: FILES };
})();
