/* luminexchess.com: the ride. One canvas that pulls back, as the page scrolls,
   from a single position to every game the bench has played:

     0  one position      a board from a real game; a piece under the pointer
                          lights the squares it attacks
     1  one game          every position of that game, as frames of a film
     2  one match         the 800 games of its match; the game is the lit cell
     3  one gauntlet      twelve matches, the games that rate the release
     4  every game        the wall: one cell for every game on the bench

   Scales 0 to 3 are one nested drawing (the board is a frame of the film, the
   film is a cell of the match, the match a field of the gauntlet), so the pull
   back is a real zoom. The wall is a second drawing that the gauntlet settles
   into. Nothing here knows chess rules beyond how a piece attacks. */
(function () {
  "use strict";

  var Lux = window.Lux, C = Lux && Lux.cells;
  var sec = document.querySelector("[data-ride]");
  if (!C || !sec || !window.fetch) return;
  var canvas = sec.querySelector(".ride-canvas");
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext("2d");
  var motion = Lux.motion;
  var track = sec.querySelector(".ride-track") || sec;
  var readout = sec.querySelector("[data-readout]");
  var panels = Lux.$$("[data-scale]", sec);
  var steps = Lux.$$("[data-go]", sec);
  var TAU = Math.PI * 2, FILES = Lux.chess.FILES, NAMES = Lux.chess.NAMES;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smooth(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
  function ease(t) { t = clamp(t, 0, 1); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

  /* ---------- geometry of the nested drawing, in cells of a match's field ---------- */
  var FCOLS = 40, HEAD = 7, GAPX = 8, GAPY = 7, FILM = 13;
  var PLY = +(sec.getAttribute("data-ply") || 14);      // the position the ride starts from

  var pal = null, col = {};
  var game = null, positions = [], thumbs = null, TH = 96;
  var fields = [], hero = null, gold = null, grid = { w: 0, h: 0, cols: 4 };
  var wall = null, wallRuns = null, wallBox = null, wallFor = 0;
  var view = { w: 0, h: 0, dpr: 1, R: null, portrait: false };
  var cams = [];
  var u = 0, target = 0, raf = 0, ready = false;
  var pointer = { x: -1, y: -1, on: false }, hover = null, lit = null;

  /* ---------- the pieces, from the page's own sprite ---------- */
  var shapes = {};
  function readPieces() {
    "KQRBNP".split("").forEach(function (p) {
      var sym = document.getElementById("p-" + p), list = [];
      if (!sym) return;
      Array.prototype.forEach.call(sym.children, function (n) {
        var path = new Path2D(), tag = n.tagName.toLowerCase();
        if (tag === "path") path = new Path2D(n.getAttribute("d"));
        else if (tag === "circle") path.arc(+n.getAttribute("cx"), +n.getAttribute("cy"), +n.getAttribute("r"), 0, TAU);
        else if (tag === "rect") {
          var x = +n.getAttribute("x"), y = +n.getAttribute("y"), w = +n.getAttribute("width"), h = +n.getAttribute("height"), rx = +(n.getAttribute("rx") || 0);
          if (path.roundRect) path.roundRect(x, y, w, h, rx); else path.rect(x, y, w, h);
        } else return;
        var kind = n.getAttribute("fill") === "none" ? "line" : n.getAttribute("stroke") === "none" ? "dot" : "body";
        list.push({ path: path, kind: kind });
      });
      shapes[p] = list;
    });
  }
  function drawPiece(c, code, x, y, size) {
    var list = shapes[code.charAt(1)];
    if (!list) return;
    var white = code.charAt(0) === "w", k = size / 45;
    c.save();
    c.translate(x, y); c.scale(k, k);
    c.lineJoin = "round"; c.lineCap = "round"; c.lineWidth = 1.4;
    var body = white ? col.pcW : col.pcB, detail = white ? col.pcLine : col.pcDetail;
    for (var i = 0; i < list.length; i++) {
      var s = list[i];
      if (s.kind === "body") { c.fillStyle = body; c.fill(s.path); c.strokeStyle = col.pcLine; c.stroke(s.path); }
      else if (s.kind === "line") { c.strokeStyle = detail; c.stroke(s.path); }
      else { c.fillStyle = detail; c.fill(s.path); }
    }
    c.restore();
  }

  /* ---------- positions ---------- */
  var parseFen = Lux.chess.parseFen, attacks = Lux.chess.attacks, mask = Lux.chess.mask, squareName = Lux.chess.squareName;
  function moveLabel(k) {
    var p = game.plies[k], white = game.whiteFirst ? k % 2 === 0 : k % 2 === 1;
    return (game.startMove + Math.floor((k + (game.whiteFirst ? 0 : 1)) / 2)) + (white ? "." : "…") + p.san;
  }
  // an engine's own score for its own side, as the cards on the games page write it
  function ownScore(p) {
    var lumWhite = game.white === "Luminex", sgn = ((p.by === "l") === lumWhite) ? 1 : -1;
    if (/#$/.test(p.san)) return "checkmate";
    if (p.mate !== null && p.mate !== undefined) { var m = p.mate * sgn; return (m > 0 ? "mates in " : "mated in ") + Math.ceil(Math.abs(m) / 2); }
    if (p.cp === null || p.cp === undefined) return "";
    var v = p.cp * sgn / 100;
    return (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(2);
  }
  // Luminex's view of the game at ply k, squashed to 0..1 for the bar under a frame
  function lumShare(k) {
    var lumWhite = game.white === "Luminex", sgn = lumWhite ? 1 : -1, p = null;
    for (var i = k; i >= 0; i--) if (game.plies[i].by === "l") { p = game.plies[i]; break; }
    if (!p) return 0.5;
    if (p.mate !== null && p.mate !== undefined) return p.mate * sgn > 0 ? 1 : 0;
    return 1 / (1 + Math.exp(-(p.cp * sgn) / 220));
  }

  /* ---------- drawing a board ---------- */
  function roundRectPath(c, x, y, w, h, r) {
    c.beginPath();
    if (c.roundRect) c.roundRect(x, y, w, h, r); else c.rect(x, y, w, h);
  }
  function drawBoard(c, k, x, y, size, opts) {
    var pos = positions[k], sq = size / 8, i, r, f;
    opts = opts || {};
    c.save();
    roundRectPath(c, x, y, size, size, Math.max(1, size * 0.012));
    c.clip();
    c.fillStyle = col.sqL; c.fillRect(x, y, size, size);
    c.fillStyle = col.sqD;
    for (r = 0; r < 8; r++) for (f = 0; f < 8; f++) if ((r + f) % 2) c.fillRect(x + f * sq, y + r * sq, sq + 0.5, sq + 0.5);
    var ply = game.plies[k];
    if (ply && sq >= 5) {                                  // the move that led here
      c.fillStyle = col.hl;
      [ply.uci.slice(0, 2), ply.uci.slice(2, 4)].forEach(function (n) {
        c.fillRect(x + (n.charCodeAt(0) - 97) * sq, y + (8 - (n.charCodeAt(1) - 48)) * sq, sq, sq);
      });
    }
    if (opts.lit) {                                        // the squares the piece under the pointer attacks
      var a = opts.lit.alpha;
      c.fillStyle = col.atk;
      opts.lit.list.forEach(function (s) {
        c.globalAlpha = a;
        c.fillRect(x + (s & 7) * sq, y + (s >> 3) * sq, sq, sq);
      });
      c.globalAlpha = a;
      c.strokeStyle = col.atkLine; c.lineWidth = Math.max(1.5, sq * 0.045);
      c.strokeRect(x + (opts.lit.from & 7) * sq + c.lineWidth / 2, y + (opts.lit.from >> 3) * sq + c.lineWidth / 2, sq - c.lineWidth, sq - c.lineWidth);
      c.globalAlpha = 1;
    }
    if (size >= 300) {                                     // coordinates, in the corner squares' own contrast
      c.font = "400 " + Math.round(clamp(sq * 0.17, 9, 12)) + "px " + col.mono;
      c.textBaseline = "alphabetic";
      for (i = 0; i < 8; i++) {
        c.fillStyle = (7 + i) % 2 ? col.coordD : col.coordL;
        c.textAlign = "right";
        c.fillText(FILES.charAt(i), x + (i + 1) * sq - sq * 0.07, y + size - sq * 0.08);
        c.fillStyle = i % 2 ? col.coordD : col.coordL;
        c.textAlign = "left";
        c.fillText(String(8 - i), x + sq * 0.07, y + i * sq + sq * 0.22);
      }
    }
    for (i = 0; i < 64; i++) if (pos[i]) drawPiece(c, pos[i], x + (i & 7) * sq, y + (i >> 3) * sq, sq);
    c.restore();
  }
  // every position once, small, so the film costs one drawImage a frame
  function buildThumbs() {
    var n = positions.length, cols = FILM;
    TH = view.dpr > 1.5 ? 128 : 96;
    thumbs = document.createElement("canvas");
    thumbs.width = cols * TH; thumbs.height = Math.ceil(n / cols) * TH;
    var c = thumbs.getContext("2d");
    for (var k = 0; k < n; k++) drawBoard(c, k, (k % cols) * TH, Math.floor(k / cols) * TH, TH);
  }

  /* ---------- colours ---------- */
  function readColours() {
    pal = C.palette(sec);
    var v = pal.v;
    col = {
      bg: v("--ride-bg", "#07080a"), plate: v("--ride-plate", "#0e1014"), ink: v("--ride-ink", "#f3efe6"),
      muted: v("--ride-muted", "#969189"), line: v("--ride-line", "rgba(243,239,230,0.16)"), lumen: v("--ride-lumen", "#ffc24b"),
      sqL: v("--sq-light", "#efe9da"), sqD: v("--sq-dark", "#b3a892"), pcW: v("--pc-w", "#fdfbf5"), pcB: v("--pc-b", "#1a1815"),
      pcLine: v("--pc-line", "#1a1815"), pcDetail: v("--pc-b-detail", "#c9c1af"), hl: v("--board-hl", "rgba(255,186,48,0.42)"),
      atk: v("--board-atk", "rgba(255,160,20,0.62)"), atkLine: v("--board-atk-line", "#b25c00"),
      coordL: v("--coord-on-light", "#6a614f"), coordD: v("--coord-on-dark", "#2b261e"),
      mono: v("--mono", "ui-monospace, monospace"), sans: v("--sans", "system-ui, sans-serif"),
      win: pal.css[C.WIN], draw: pal.css[C.DRAW], loss: pal.css[C.LOSS]
    };
    var bg = C.rgba(col.bg), wn = C.rgba(col.win);
    col.litGlow = parseFloat(v("--lit-glow", "0.34")) || 0;
    col.bgA = function (a) { return "rgba(" + bg[0] + "," + bg[1] + "," + bg[2] + "," + a.toFixed(3) + ")"; };
    col.glow = "rgba(" + wn[0] + "," + wn[1] + "," + wn[2] + ",0.13)";
  }

  /* ---------- the gauntlet's fields ---------- */
  function buildFields(g) {
    fields = g.opponents.map(function (o) {
      var run = { id: o.test, k: "g", w: o.w, d: o.d, l: o.l };
      var cells = C.scatter(run), by = [[], [], []];
      for (var i = 0; i < cells.length; i++) by[cells[i]].push(i);
      return { name: o.name, rating: o.rating, test: o.test, n: o.games, w: o.w, d: o.d, l: o.l, score: o.score,
               cells: cells, by: by, rows: Math.ceil(cells.length / FCOLS), bitmap: null, x: 0, y: 0 };
    });
    var want = +(sec.getAttribute("data-test") || 0);
    hero = fields.filter(function (f) { return f.test === want; })[0] || fields[0];
    gold = { index: hero.by[C.WIN].length ? hero.by[C.WIN][0] : 0 };
  }
  function paintFields() {
    fields.forEach(function (f) { f.bitmap = C.fieldBitmap(f.cells, FCOLS, pal); });
  }

  /* ---------- layout: where everything sits for this window ---------- */
  function rectOfFrame(k) {
    var s = 1 / FILM;
    return { x: gold.x + (k % FILM) * s, y: gold.y + Math.floor(k / FILM) * s, w: s, h: s };
  }
  function boardInFrame(fr) {         // the board keeps the top of its frame; its label sits underneath
    var size = fr.w * 0.8;
    return { x: fr.x + (fr.w - size) / 2, y: fr.y + fr.w * 0.05, w: size, h: size };
  }
  function fit(rect, R, pad) {
    var s = Math.min((R.w - 2 * pad) / rect.w, (R.h - 2 * pad) / rect.h);
    return { s: s, cx: rect.x + rect.w / 2, cy: rect.y + rect.h / 2 };
  }
  function layout(w, h, dpr) {
    view.w = w; view.h = h; view.dpr = dpr;
    view.portrait = w < 900;
    // the part of the window the drawing may use: beside the words on a wide window, above them on a narrow one
    var top = 84, R;
    if (view.portrait) R = { x: 16, y: 68, w: w - 32, h: Math.max(200, Math.min(h * 0.5, w) - 76) };
    else {
      var left = Math.max(w * 0.47, Math.min(w * 0.5, 700));
      R = { x: left, y: top, w: w - left - Math.max(32, w * 0.04), h: h - top - 96 };
    }
    R.cx = R.x + R.w / 2; R.cy = R.y + R.h / 2;
    view.R = R;

    grid.cols = 3;
    var rowsMax = 0;
    fields.forEach(function (f) { rowsMax = Math.max(rowsMax, f.rows); });
    var pitchX = FCOLS + GAPX, pitchY = rowsMax + HEAD + GAPY;
    fields.forEach(function (f, i) {
      f.x = (i % grid.cols) * pitchX;
      f.y = Math.floor(i / grid.cols) * pitchY;
    });
    grid.w = grid.cols * pitchX - GAPX;
    grid.h = Math.ceil(fields.length / grid.cols) * pitchY - GAPY;
    gold.x = hero.x + (gold.index % FCOLS);
    gold.y = hero.y + HEAD + Math.floor(gold.index / FCOLS);

    cams = [
      fit(boardInFrame(rectOfFrame(PLY)), R, view.portrait ? 4 : 10),
      fit({ x: gold.x, y: gold.y, w: 1, h: 1 }, R, view.portrait ? 6 : 14),
      fit({ x: hero.x - 2, y: hero.y, w: FCOLS + 4, h: hero.rows + HEAD }, R, view.portrait ? 6 : 28),
      fit({ x: 0, y: 0, w: grid.w, h: grid.h }, R, view.portrait ? 4 : 18)
    ];
    if (wallRuns) layoutWall();
  }
  function layoutWall() {
    var aspect = view.w / view.h;
    if (!wall) wall = new C.Wall(wallRuns);
    if (wallFor !== aspect || !wall.bitmap) { wall.layout(aspect, pal); wallFor = aspect; }
    var members = [], anchor = -1;
    wallRuns.forEach(function (r, i) {
      if (fields.some(function (f) { return f.test === r.id; })) members.push(i);
      if (r.id === hero.test) anchor = i;
    });
    wallBox = members.length ? wall.box(members, anchor < 0 ? members[0] : anchor) : { x: 0, y: 0, w: wall.rw, h: 80 };
  }

  /* ---------- the camera ---------- */
  // each stretch of the ride holds still at both ends, so the words can be read
  function along(t) { return ease((t - 0.2) / 0.6); }
  function cameraAt(pos) {
    var i = clamp(Math.floor(pos), 0, 2), t = along(pos - i), a = cams[i], b = cams[i + 1], R = view.R;
    if (pos >= 3) return { s: cams[3].s, px: R.cx, py: R.cy, ax: cams[3].cx, ay: cams[3].cy };
    // the scale changes by a constant factor a step, while the inner drawing drifts to its place in the outer one
    var s = a.s * Math.pow(b.s / a.s, t);
    var ex = (a.cx - b.cx) * b.s + R.cx, ey = (a.cy - b.cy) * b.s + R.cy;
    return { s: s, px: lerp(R.cx, ex, t), py: lerp(R.cy, ey, t), ax: a.cx, ay: a.cy };
  }

  /* ---------- drawing ---------- */
  function drawFilm(c, cam, alpha) {
    var s = cam.s / FILM, X0 = (gold.x - cam.ax) * cam.s + cam.px, Y0 = (gold.y - cam.ay) * cam.s + cam.py;
    var n = positions.length, w = view.w, h = view.h;
    c.save();
    c.globalAlpha = alpha;
    roundRectPath(c, X0, Y0, cam.s, cam.s, Math.max(2, cam.s * 0.02));
    c.fillStyle = col.plate; c.fill();
    c.strokeStyle = col.lumen; c.lineWidth = Math.min(2, Math.max(1, cam.s * 0.004)); c.stroke();   // it is still the lit cell
    c.imageSmoothingEnabled = true; c.imageSmoothingQuality = "high";
    for (var k = 0; k < n; k++) {
      var fx = X0 + (k % FILM) * s, fy = Y0 + Math.floor(k / FILM) * s;
      if (fx > w || fy > h || fx + s < 0 || fy + s < 0) continue;
      var size = s * 0.8, bx = fx + (s - size) / 2, by = fy + s * 0.05;
      var isLit = lit && lit.k === k && cam.s > 4000;
      var near = smooth((cams[0].s / cam.s - 1.05) / 1.6);   // 0 at the board's scale, 1 once the camera has pulled back
      var fa = k === PLY ? alpha : alpha * near;
      if (fa < 0.01) continue;
      c.globalAlpha = fa;
      if (size >= 110) drawBoard(c, k, bx, by, size, isLit ? { lit: lit } : null);
      else c.drawImage(thumbs, (k % FILM) * TH, Math.floor(k / FILM) * TH, TH, TH, bx, by, size, size);
      if (size >= 14 && near > 0.01) {                      // Luminex's score, as a bar under the frame
        var share = lumShare(k), barY = by + size + Math.max(1, s * 0.022), barH = Math.max(1, s * 0.016);
        c.globalAlpha = alpha * near;
        c.fillStyle = col.line; c.fillRect(bx, barY, size, barH);
        c.fillStyle = col.lumen; c.fillRect(bx, barY, size * share, barH);
      }
      if (s >= 74 && near > 0.01) {
        c.globalAlpha = alpha * smooth((s - 74) / 40) * near;
        c.font = (game.moments && game.moments[k] ? "500 " : "400 ") + Math.round(clamp(s * 0.062, 9, 13)) + "px " + col.mono;
        c.textAlign = "left"; c.textBaseline = "alphabetic";
        c.fillStyle = k === PLY || (game.moments && game.moments[k]) ? col.lumen : col.muted;
        c.fillText(moveLabel(k), bx, fy + s * 0.975);
      }
      c.globalAlpha = alpha;
      if (hover && hover.kind === "frame" && hover.k === k) {
        c.strokeStyle = col.ink; c.lineWidth = 1.5;
        c.strokeRect(bx - 3, by - 3, size + 6, size + 6);
      }
    }
    c.restore();
  }
  function drawFields(c, cam, alphaAll, others) {
    var cs = cam.s, w = view.w, h = view.h;
    fields.forEach(function (f) {
      var X = (f.x - cam.ax) * cs + cam.px, Y = (f.y + HEAD - cam.ay) * cs + cam.py;
      var W = FCOLS * cs, H = f.rows * cs;
      var alpha = alphaAll * (f === hero ? 1 : others) * (1 - smooth((cs - 110) / 170));
      if (alpha < 0.01 || X > w || Y > h || X + W < 0 || Y + H < 0) return;
      c.globalAlpha = alpha;
      if (cs < 2.4) {
        c.imageSmoothingEnabled = cs < 1;
        c.drawImage(f.bitmap, X, Y, W, H);
      } else {
        var gap = Math.max(0.6, cs * 0.14), size = cs - gap, rad = cs >= 9 ? Math.min(size * 0.22, 6) : 0;
        var i0 = Math.max(0, Math.floor(-Y / cs)), i1 = Math.min(f.rows, Math.ceil((h - Y) / cs));
        var j0 = Math.max(0, Math.floor(-X / cs)), j1 = Math.min(FCOLS, Math.ceil((w - X) / cs));
        for (var cl = 0; cl < 3; cl++) {
          var list = f.by[cl], q, k, r, cc;
          if (cl === C.WIN && cs >= 4 && cs < 400) {             // a lit cell spills a little light
            c.fillStyle = col.glow;
            c.beginPath();
            for (q = 0; q < list.length; q++) {
              k = list[q]; r = (k / FCOLS) | 0; cc = k - r * FCOLS;
              if (r < i0 - 1 || r > i1 || cc < j0 - 1 || cc > j1) continue;
              c.rect(X + cc * cs - cs * 0.42, Y + r * cs - cs * 0.42, cs * 1.84, cs * 1.84);
            }
            c.fill();
          }
          for (var par = 0; par < 2; par++) {
            if (par && cl === C.WIN) break;
            c.fillStyle = par ? pal.alt[cl] : pal.css[cl];
            c.beginPath();
            for (q = 0; q < list.length; q++) {
              k = list[q]; r = (k / FCOLS) | 0; cc = k - r * FCOLS;
              if (r < i0 || r >= i1 || cc < j0 || cc >= j1) continue;
              if (cl !== C.WIN && ((r + cc) & 1) !== par) continue;
              var x = X + cc * cs + gap / 2, y = Y + r * cs + gap / 2;
              if (rad && c.roundRect) c.roundRect(x, y, size, size, rad); else c.rect(x, y, size, size);
            }
            c.fill();
          }
        }
      }
      // the opponent's name and rating, once the field is wide enough to carry them
      var la = smooth((W - 96) / 60) * alpha;
      if (la > 0.01) {
        var fs = clamp(cs * 2.3, 10.5, 15);
        c.globalAlpha = la;
        c.textBaseline = "alphabetic"; c.textAlign = "left";
        c.font = "500 " + fs.toFixed(1) + "px " + col.sans;
        c.fillStyle = col.ink;
        c.fillText(f.name, X, Y - cs * 1.9);
        c.font = "400 " + (fs * 0.86).toFixed(1) + "px " + col.mono;
        c.textAlign = "right";
        c.fillStyle = col.muted;
        c.fillText(String(f.rating), X + W, Y - cs * 1.9);
        if (hover && hover.kind === "field" && hover.field === f) {
          c.strokeStyle = col.ink; c.lineWidth = 1;
          c.strokeRect(X - 4.5, Y - 4.5, W + 9, H + 9);
        }
      }
    });
    c.globalAlpha = 1;
  }
  function drawWall(c, s, px, py, alpha) {
    // (wallBox centre) sits at (px, py); one wall cell is s pixels
    var gx = wallBox.x + wallBox.w / 2, gy = wallBox.y + wallBox.h / 2;
    var X = px - gx * s, Y = py - gy * s;
    c.globalAlpha = alpha;
    c.imageSmoothingEnabled = s < 1;
    c.imageSmoothingQuality = "medium";
    c.drawImage(wall.bitmap, X, Y, wall.W * s, wall.H * s);
    if (wall.glow && s < 3 && col.litGlow > 0) {
      c.globalCompositeOperation = "lighter";
      c.globalAlpha = alpha * 0.55 * (1 - smooth((s - 1.5) / 1.5));
      c.imageSmoothingEnabled = true;
      c.drawImage(wall.glow, X, Y, wall.W * s, wall.H * s);
      c.globalCompositeOperation = "source-over";
    }
    c.globalAlpha = 1;
    return { X: X, Y: Y, s: s };
  }
  function drawLoupe(c, t) {
    var r = 78, k = Math.max(7, 9 / Math.max(t.s, 0.2)) * t.s, x = pointer.x, y = pointer.y;
    var wx = (x - t.X) / t.s, wy = (y - t.Y) / t.s;
    c.save();
    c.beginPath(); c.arc(x, y, r, 0, TAU); c.clip();
    c.fillStyle = col.bg; c.fillRect(x - r, y - r, 2 * r, 2 * r);
    c.imageSmoothingEnabled = false;
    c.drawImage(wall.bitmap, x - wx * k, y - wy * k, wall.W * k, wall.H * k);
    c.restore();
    c.beginPath(); c.arc(x, y, r, 0, TAU);
    c.strokeStyle = col.ink; c.lineWidth = 1.5; c.stroke();
    c.strokeStyle = col.lumen; c.lineWidth = 1;
    c.strokeRect(x - k / 2, y - k / 2, k, k);
  }
  function scrim(c, w, h, pos) {
    var R = view.R, onWall = smooth((pos - 3.2) / 0.6), g;
    if (view.still) return;
    if (view.portrait) {
      var y0 = R.y + R.h - 6;
      g = c.createLinearGradient(0, y0, 0, y0 + 40);
    } else {
      g = c.createLinearGradient(R.x * (0.5 + 0.12 * onWall), 0, R.x - 12 + w * 0.06 * onWall, 0);
    }
    var strong = 1 - 0.14 * onWall;
    g.addColorStop(view.portrait ? 1 : 0, col.bgA(strong));
    g.addColorStop(view.portrait ? 0 : 1, col.bgA(0));
    c.fillStyle = g;
    if (view.portrait) c.fillRect(0, R.y + R.h - 6, w, h); else c.fillRect(0, 0, R.x + w * 0.06, h);
  }
  function render(c, w, h, pos) {
    c.clearRect(0, 0, w, h);
    c.fillStyle = col.bg; c.fillRect(0, 0, w, h);
    if (!ready) return;
    var R = view.R, cam, wallT = null;
    if (pos <= 3) {
      cam = cameraAt(pos);
    } else {
      // the gauntlet settles into its own cells on the wall, which then fills the window
      var t = along(pos - 3);
      var s0 = Math.min(grid.w * cams[3].s / wallBox.w, grid.h * cams[3].s / wallBox.h);
      var s1 = Math.max(w / wall.W, h / wall.H);
      var s = s0 * Math.pow(s1 / s0, t);
      var gx = wallBox.x + wallBox.w / 2, gy = wallBox.y + wallBox.h / 2;
      var ex = w / 2 + (gx - wall.W / 2) * s1, ey = h / 2 + (gy - wall.H / 2) * s1;
      var px = lerp(R.cx, ex, t), py = lerp(R.cy, ey, t);
      wallT = drawWall(c, s, px, py, smooth(t / 0.45));
      cam = { s: cams[3].s * s / s0, px: px, py: py, ax: cams[3].cx, ay: cams[3].cy };
      var fade = 1 - smooth((t - 0.12) / 0.5);
      if (fade > 0.01) {
        c.fillStyle = col.bg; c.globalAlpha = fade * 0.86;
        c.fillRect(px - grid.w * cam.s / 2 - 8, py - grid.h * cam.s / 2 - 8, grid.w * cam.s + 16, grid.h * cam.s + 16);
        c.globalAlpha = 1;
        drawFields(c, cam, fade, 1);
      }
      // a frame around the gauntlet's cells, so the eye keeps its place
      var ba = smooth(t / 0.4) * (1 - smooth((t - 0.75) / 0.25) * 0.4);
      c.globalAlpha = ba;
      c.strokeStyle = col.lumen; c.lineWidth = 1;
      c.strokeRect(wallT.X + wallBox.x * s - 3.5, wallT.Y + wallBox.y * s - 3.5, wallBox.w * s + 7, wallBox.h * s + 7);
      c.globalAlpha = 1;
    }
    if (pos <= 3) {
      drawFields(c, cam, 1, smooth((pos - 2.2) / 0.45));
      var film = smooth((cam.s - 70) / 170);
      if (film > 0.01) drawFilm(c, cam, film);
    }
    scrim(c, w, h, pos);
    if (wallT && pointer.on && hover && hover.kind === "run" && Lux.finePointer) drawLoupe(c, wallT);
    render.wallT = wallT; render.cam = cam;
  }

  /* ---------- what is under the pointer ---------- */
  function say(text) { if (readout && readout.textContent !== text) readout.textContent = text; }
  function idle() {
    var st = Math.round(u);
    if (Math.abs(u - st) > 0.3) return "";
    var touch = Lux.finePointer ? "point at" : "touch";
    if (st === 0 && game) return moveLabel(PLY) + " · Luminex " + ownScore(lastBy("l", PLY)) + ", depth " + lastBy("l", PLY).depth + " · " + touch + " a piece";
    if (st === 1) return "Each frame is a position · the bar under it is Luminex's own score";
    if (st === 2) return "Lit: a win · dim: a draw · dark: a loss";
    if (st === 3) return "Strongest opponent first · " + touch + " a field for its score";
    if (st === 4) return Lux.finePointer ? "Point at the wall to read a run" : "Lit: wins · violet: tuning runs · touch for a run";
    return "";
  }
  function lastBy(who, k) { for (var i = k; i >= 0; i--) if (game.plies[i].by === who) return game.plies[i]; return game.plies[0]; }
  function pick() {
    var prev = hover, st = Math.round(u), cam = render.cam;
    hover = null;
    var newLit = null;
    if (ready && pointer.on && Math.abs(u - st) < 0.22 && cam) {
      var x = pointer.x, y = pointer.y;
      if (st === 4 && render.wallT) {
        var t = render.wallT, hit = wall.at((x - t.X) / t.s, (y - t.Y) / t.s);
        if (hit) hover = { kind: "run", run: hit.run, value: hit.value };
      } else if (st <= 3) {
        var wx = (x - cam.px) / cam.s + cam.ax, wy = (y - cam.py) / cam.s + cam.ay;
        if (st === 0) {
          var b = boardInFrame(rectOfFrame(PLY)), f = Math.floor((wx - b.x) / b.w * 8), r = Math.floor((wy - b.y) / b.h * 8);
          if (f >= 0 && f < 8 && r >= 0 && r < 8 && wx >= b.x && wy >= b.y) {
            var sq = r * 8 + f, code = positions[PLY][sq];
            hover = { kind: "square", sq: sq, code: code };
            if (code) newLit = { k: PLY, from: sq, list: attacks(positions[PLY], sq), alpha: 1 };
          }
        } else if (st === 1) {
          var fxk = Math.floor((wx - gold.x) * FILM), fyk = Math.floor((wy - gold.y) * FILM), k = fyk * FILM + fxk;
          if (fxk >= 0 && fxk < FILM && fyk >= 0 && k < positions.length && wx >= gold.x && wy >= gold.y) hover = { kind: "frame", k: k };
        } else {
          for (var i = 0; i < fields.length; i++) {
            var fl = fields[i];
            if (wx >= fl.x && wx < fl.x + FCOLS && wy >= fl.y + HEAD && wy < fl.y + HEAD + fl.rows) {
              var cellI = Math.floor(wy - fl.y - HEAD) * FCOLS + Math.floor(wx - fl.x);
              if (cellI < fl.cells.length) hover = { kind: st === 2 ? "cell" : "field", field: fl, cell: cellI, value: fl.cells[cellI] };
              break;
            }
          }
        }
      }
    }
    lit = newLit;
    var text = idle();
    if (hover) {
      if (hover.kind === "square") {
        if (hover.code) {
          var list = lit.list, side = hover.code.charAt(0) === "w" ? "White" : "Black";
          text = side + " " + NAMES[hover.code.charAt(1)] + " on " + squareName(hover.sq) + " attacks " + list.length +
                 (list.length === 1 ? " square · " : " squares · ") + mask(list);
        } else text = squareName(hover.sq) + " · an empty square";
      } else if (hover.kind === "frame") {
        var p = game.plies[hover.k], who = p.by === "l" ? "Luminex" : (game.white === "Luminex" ? game.black : game.white);
        text = moveLabel(hover.k) + " · " + who + " " + ownScore(p) + (p.depth ? ", depth " + p.depth : "");
      } else if (hover.kind === "cell") {
        text = hover.value === C.WIN ? "The win: " + game.title : hover.value === C.DRAW ? "A draw" : "A loss";
      } else if (hover.kind === "field") {
        var fd = hover.field;
        text = fd.name + " (" + fd.rating + ") · " + fd.w + (fd.w === 1 ? " win, " : " wins, ") + fd.d + " draws, " + fd.l + " losses";
      } else if (hover.kind === "run") {
        text = runLine(hover.run);
      }
    }
    say(text);
    if (Lux.pointerAway) Lux.pointerAway(!!(hover && hover.kind === "run"));
    var changed = (prev ? prev.kind + (prev.sq || prev.k || (prev.field && prev.field.test) || (prev.run && prev.run.id) || "") : "") !==
                  (hover ? hover.kind + (hover.sq || hover.k || (hover.field && hover.field.test) || (hover.run && hover.run.id) || "") : "");
    return changed || (hover && hover.kind === "run");
  }
  var runLine = C.runLine;

  /* ---------- the loop ---------- */
  var shownPanel = -1;
  function sync() {
    var st = Math.round(u), near = Math.abs(u - st) < 0.38, on = near ? st : -1;
    if (on !== shownPanel) {
      shownPanel = on;
      var num = on >= 0 && panels[on] ? panels[on].querySelector(".scale-num") : null;
      if (num && Lux.odo) Lux.odo(num).replay();
    }
    panels.forEach(function (p, i) { p.classList.toggle("is-on", near && i === st); });
    steps.forEach(function (b, i) { if (i === st) b.setAttribute("aria-current", "step"); else b.removeAttribute("aria-current"); });
    sec.classList.toggle("is-wall", u > 3.45);
    sec.setAttribute("data-at", String(st));
  }
  function frame() {
    raf = 0;
    var d = target - u;
    if (Math.abs(d) < 0.0006) u = target; else u += d * 0.14;
    pick();
    render(ctx, view.w, view.h, u);
    sync();
    if (u !== target) schedule();
  }
  function schedule() { if (!raf) raf = requestAnimationFrame(frame); }
  function measure() {
    var r = track.getBoundingClientRect(), span = r.height - window.innerHeight;
    target = span > 1 ? clamp(-r.top / span, 0, 1) * 4 : 0;
    schedule();
  }
  function resize() {
    var w = canvas.clientWidth, h = canvas.clientHeight, dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (!w || !h) return;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (ready) layout(w, h, dpr); else { view.w = w; view.h = h; view.dpr = dpr; }
    measure();
  }

  /* ---------- without motion: five still drawings, one beside each caption ---------- */
  function stills() {
    panels.forEach(function (p, i) {
      var holder = p.querySelector("[data-still]");
      if (!holder) return;
      var cv = document.createElement("canvas"), w = holder.clientWidth || 320, h = Math.round(w * (i === 4 ? 0.62 : 0.8));
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = w * dpr; cv.height = h * dpr;
      cv.className = "ride-still-cv";
      holder.appendChild(cv);
      var c = cv.getContext("2d");
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      layout(w, h, dpr);
      view.still = true;
      view.R = { x: 8, y: 8, w: w - 16, h: h - 16, cx: w / 2, cy: h / 2 };
      var R = view.R;
      cams = [
        fit(boardInFrame(rectOfFrame(PLY)), R, 0), fit({ x: gold.x, y: gold.y, w: 1, h: 1 }, R, 0),
        fit({ x: hero.x - 2, y: hero.y, w: FCOLS + 4, h: hero.rows + HEAD }, R, 4), fit({ x: 0, y: 0, w: grid.w, h: grid.h }, R, 4)
      ];
      render(c, w, h, i);
    });
  }

  /* ---------- start ---------- */
  function json(url) { return fetch(url, { credentials: "same-origin" }).then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); }); }
  var settled = Lux.wait ? Lux.wait() : function () {};
  Promise.all([json(sec.getAttribute("data-src")), json(sec.getAttribute("data-gauntlet")), json(sec.getAttribute("data-wall"))])
    .then(function (got) {
      game = got[0][0];
      positions = game.plies.map(function (p) { return parseFen(p.fen); });
      PLY = clamp(PLY, 0, positions.length - 1);
      wallRuns = got[2].runs;
      readPieces();
      readColours();
      buildFields(got[1]);
      paintFields();
      var w = canvas.clientWidth || 1200, h = canvas.clientHeight || 800, dpr = Math.min(window.devicePixelRatio || 1, 2);
      view.dpr = dpr;
      ready = true;
      layout(w, h, dpr);
      buildThumbs();
      sec.classList.add("is-live");
      var counts = { plies: positions.length, match: hero.n };
      Lux.$$("[data-count]", sec).forEach(function (n) {
        var v = counts[n.getAttribute("data-count")];
        if (v) n.textContent = v.toLocaleString("en-US");
      });
      if (!motion) { stills(); return; }
      resize();
    })
    .catch(function () { sec.classList.add("is-plain"); })
    .then(settled);

  if (motion) {
    window.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", function () { resize(); });
    canvas.addEventListener("pointermove", function (e) {
      var r = canvas.getBoundingClientRect();
      pointer.x = e.clientX - r.left; pointer.y = e.clientY - r.top; pointer.on = true;
      schedule();
    });
    canvas.addEventListener("pointerdown", function (e) {
      var r = canvas.getBoundingClientRect();
      pointer.x = e.clientX - r.left; pointer.y = e.clientY - r.top; pointer.on = true;
      schedule();
    });
    canvas.addEventListener("pointerleave", function () { pointer.on = false; schedule(); });
    canvas.addEventListener("click", function () {
      var href = hover && hover.kind === "run" ? C.runHref(hover.run, !!hover.run.e) : null;
      if (href) window.location.href = href;
      else if (hover && hover.kind === "cell" && hover.value === C.WIN) window.location.href = "/games/";
    });
    steps.forEach(function (b, i) {
      b.addEventListener("click", function () {
        var r = track.getBoundingClientRect(), span = r.height - window.innerHeight;
        window.scrollTo({ top: window.scrollY + r.top + span * (i / 4) + 2, behavior: "smooth" });
      });
    });
    // the theme switch repaints everything that was drawn from the old colours
    new MutationObserver(function () {
      if (!ready) return;
      readColours(); paintFields(); buildThumbs();
      if (wall) { wallFor = 0; layoutWall(); }
      schedule();
    }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(schedule);
  }
})();
