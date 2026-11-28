/* luminexchess.com: the game viewer. Replays games from /assets/data/games.json
   with both engines' own evaluations. Each ply carries the position after the
   move, so no chess rules are needed here. */
(function () {
  "use strict";

  var Lux = window.Lux;
  var root = document.querySelector(".viewer");
  if (!Lux || !root || !window.fetch) return;
  var el = Lux.el, motion = Lux.motion;

  function $(name) { return root.querySelector('[data-v="' + name + '"]'); }
  var tabsEl = root.querySelector(".viewer-tabs");
  var boardEl = root.querySelector(".board");
  var evalFill = root.querySelector(".evalbar i");
  var movesEl = $("moves"), chipsEl = $("chips"), plot = $("plot"), marksEl = $("marks"), drawEl = $("draw");
  var playBtn = root.querySelector('[data-act="play"]');

  var board = new Lux.Board(boardEl, { coords: true });

  /* ---------- the light a piece throws: the squares it attacks, under the pointer ---------- */
  var hintEl = root.querySelector(".viewer-hint"), hintText = hintEl ? hintEl.textContent : "";
  var atkLayer = el("div", "atk-layer"), atkFrom = el("span", "atk atk-from"), atkCells = [];
  atkLayer.setAttribute("aria-hidden", "true");
  atkLayer.appendChild(atkFrom);
  for (var ai = 0; ai < 28; ai++) { var cell = el("span", "atk"); atkCells.push(cell); atkLayer.appendChild(cell); }
  boardEl.appendChild(atkLayer);
  var atkSq = -1;
  function placeAt(node, sq) {
    var f = sq & 7, r = sq >> 3;
    node.style.setProperty("--x", board.flipped ? 7 - f : f);
    node.style.setProperty("--y", board.flipped ? 7 - r : r);
  }
  function light(sq) {
    if (sq === atkSq) return;
    atkSq = sq;
    var pos = game && sq >= 0 ? Lux.chess.parseFen(ply < 0 ? game.startFen : game.plies[ply].fen) : null;
    var code = pos ? pos[sq] : null, list = code ? Lux.chess.attacks(pos, sq) : [];
    atkLayer.classList.toggle("is-on", !!code);
    if (code) placeAt(atkFrom, sq);
    atkCells.forEach(function (c, i) {
      c.hidden = i >= list.length;
      if (i < list.length) placeAt(c, list[i]);
    });
    if (!hintEl) return;
    hintEl.textContent = code
      ? (code.charAt(0) === "w" ? "White " : "Black ") + Lux.chess.NAMES[code.charAt(1)] + " on " + Lux.chess.squareName(sq) + " attacks " +
        list.length + (list.length === 1 ? " square · " : " squares · ") + Lux.chess.mask(list)
      : hintText;
  }
  function squareUnder(e) {
    var r = boardEl.getBoundingClientRect(), f = Math.floor((e.clientX - r.left) / r.width * 8), k = Math.floor((e.clientY - r.top) / r.height * 8);
    if (f < 0 || f > 7 || k < 0 || k > 7) return -1;
    return board.flipped ? (7 - k) * 8 + (7 - f) : k * 8 + f;
  }
  if (Lux.chess) {
    boardEl.addEventListener("pointermove", function (e) { light(squareUnder(e)); });
    boardEl.addEventListener("pointerdown", function (e) { light(squareUnder(e)); });
    boardEl.addEventListener("pointerleave", function () { light(-1); });
  }

  /* ---------- the whole match, as cells: this game is the lit one ---------- */
  var fieldEl = root.querySelector("[data-v='field']");
  var themeWatch = null;
  function drawField(m) {
    if (!fieldEl || !Lux.cells || !m) { if (fieldEl) fieldEl.hidden = true; return; }
    fieldEl.hidden = false;
    var C = Lux.cells, cells = C.scatter({ id: m.test, k: "g", w: m.wins, d: m.draws, l: m.losses });
    var cols = 40, rows = Math.ceil(cells.length / cols), w = fieldEl.clientWidth || 360, cs = w / cols, h = Math.ceil(rows * cs);
    var dpr = Math.min(window.devicePixelRatio || 1, 2), pal = C.palette(root);
    fieldEl.width = Math.round(w * dpr); fieldEl.height = Math.round(h * dpr);
    fieldEl.style.setProperty("--h", h + "px");
    var c = fieldEl.getContext("2d");
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);
    var gap = Math.max(1, cs * 0.16), size = cs - gap;
    for (var i = 0; i < cells.length; i++) {
      var x = i % cols, y = (i / cols) | 0, v = cells[i];
      if (v === C.WIN) {
        c.fillStyle = "rgba(" + pal.rgb[C.WIN].slice(0, 3).join(",") + ",0.22)";
        c.fillRect(x * cs - cs * 0.5, y * cs - cs * 0.5, cs * 2, cs * 2);
      }
      c.fillStyle = ((x + y) & 1 ? pal.alt : pal.css)[v];
      c.fillRect(x * cs + gap / 2, y * cs + gap / 2, size, size);
    }
  }
  var games = [], game = null, gi = 0;
  var ply = -1;        // -1 = starting position, k = after ply k
  var playing = false, timer = 0;
  var moveButtons = [], tabs = [];

  function moveNumber(g, k) { return g.startMove + Math.floor((k + (g.whiteFirst ? 0 : 1)) / 2); }
  function whiteMoved(g, k) { return g.whiteFirst ? k % 2 === 0 : k % 2 === 1; }
  function moveLabel(g, k) { return moveNumber(g, k) + (whiteMoved(g, k) ? "." : "...") + g.plies[k].san; }

  // an engine's score for its own side: positive means it thinks it is better
  function ownSign(g, by) { return (by === "l") === (g.white === "Luminex") ? 1 : -1; }
  function formatScore(g, p) {
    var s = ownSign(g, p.by);
    if (/#$/.test(p.san || "")) return { text: "#", meta: "checkmate", cp: 3000 };   // the mating move itself
    if (p.mate !== null) {
      var m = p.mate * s;
      if (m === 0) return { text: "#", meta: "checkmate", cp: 3000 };
      var n = Math.ceil(Math.abs(m) / 2);   // mate scores are stored in plies
      return { text: (m > 0 ? "+M" : "−M") + n, meta: m > 0 ? "mates in " + n : "mated in " + n, cp: m > 0 ? 3000 : -3000 };
    }
    // from 15000 the engine is not counting pawns: it has found an ending it knows is won (VALUE_KNOWN_WIN)
    if (Math.abs(p.cp) >= 15000) {
      var won = p.cp * s > 0;
      return { text: won ? "won" : "lost", meta: (won ? "a known win" : "a known loss") + ", depth " + p.depth, cp: won ? 3000 : -3000 };
    }
    var v = (p.cp * s) / 100;
    return { text: (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(2), meta: "depth " + p.depth, cp: p.cp * s };
  }
  // any score from Luminex's side, squashed to [-1, 1] for the graph
  function lumValue(g, p) {
    var s = g.white === "Luminex" ? 1 : -1;
    if (p.mate !== null) {
      var m = p.mate * s;
      if (m === 0) m = p.by === "l" ? 1 : -1;   // the mover delivered mate
      return m > 0 ? 1 : -1;
    }
    return Math.tanh((p.cp * s) / 350);
  }

  /* ---------- side panel ---------- */
  function latest(by) {
    for (var k = ply; k >= 0; k--) if (game.plies[k].by === by) return game.plies[k];
    return null;
  }
  function showEval(prefix, p) {
    var score = $(prefix + "-score"), meta = $(prefix + "-meta");
    if (!p) { score.textContent = "–"; meta.textContent = "its own score"; return null; }
    var s = formatScore(game, p);
    score.textContent = s.text;
    meta.textContent = "its own score, " + s.meta;
    return s;
  }
  function showGap(l, s, L, S) {
    var gap = $("gap"), text = "";
    // once either engine sees a decided game, the size of the gap means nothing
    if (l && s && l.mate === null && s.mate === null && Math.abs(L.cp) < 2000 && Math.abs(S.cp) < 2000) {
      var diff = Math.abs(L.cp + S.cp) / 100;        // the same position from opposite sides
      if (diff >= 1.5) text = "The two engines disagree by " + diff.toFixed(1) + " pawns.";
    }
    if (gap.textContent !== text) gap.textContent = text;
  }
  function showMoment() {
    var box = $("moment-box"), keys = Object.keys(game.moments).map(Number).sort(function (a, b) { return a - b; });
    var at = -1;
    for (var i = 0; i < keys.length; i++) if (keys[i] <= ply) at = keys[i];
    if (at < 0) { box.hidden = true; return; }
    var text = game.moments[String(at)], cut = text.indexOf(": ");
    var label = $("moment-label");
    label.textContent = at === ply ? "Key moment · " : "Earlier · ";
    label.appendChild(el("span", "moment-move", moveLabel(game, at)));   // SAN keeps its case
    $("moment").textContent = cut > 0 ? text.slice(cut + 2) : text;
    box.classList.toggle("is-past", at !== ply);
    box.hidden = false;
  }
  function scrollMoveIntoView(btn) {
    var top = btn.offsetTop, bottom = top + btn.offsetHeight;
    if (top < movesEl.scrollTop + 6) movesEl.scrollTop = Math.max(0, top - 6);
    else if (bottom > movesEl.scrollTop + movesEl.clientHeight - 6) movesEl.scrollTop = bottom - movesEl.clientHeight + 6;
  }
  function showMove() {
    moveButtons.forEach(function (b, k) {
      var on = k === ply;
      b.classList.toggle("is-current", on);
      if (on) b.setAttribute("aria-current", "step"); else b.removeAttribute("aria-current");
    });
    if (ply >= 0) scrollMoveIntoView(moveButtons[ply]); else movesEl.scrollTop = 0;
    boardEl.setAttribute("aria-label", ply < 0
      ? "Chess board, starting position after the opening moves"
      : "Chess board after " + moveLabel(game, ply));
    root.querySelector('[data-act="first"]').disabled = ply < 0;
    root.querySelector('[data-act="prev"]').disabled = ply < 0;
    root.querySelector('[data-act="next"]').disabled = ply >= game.plies.length - 1;
    root.querySelector('[data-act="last"]').disabled = ply >= game.plies.length - 1;
  }

  /* ---------- evaluation graph ---------- */
  function xOf(k) { return game.plies.length < 2 ? 0 : (k / (game.plies.length - 1)) * 1000; }
  function yOf(v) { return 100 - 92 * v; }
  function drawGraph() {
    var lum = [], stash = [];
    game.plies.forEach(function (p, k) {
      if (p.cp === null && p.mate === null) return;
      (p.by === "l" ? lum : stash).push([xOf(k), yOf(lumValue(game, p))]);
    });
    function line(pts) { return pts.map(function (q, i) { return (i ? "L" : "M") + q[0].toFixed(1) + " " + q[1].toFixed(1); }).join(""); }
    $("lum-line").setAttribute("d", line(lum));
    $("stash-line").setAttribute("d", line(stash));
    $("lum-area").setAttribute("d", lum.length
      ? "M" + lum[0][0].toFixed(1) + " 100" + line(lum).replace(/^M/, "L") + "L" + lum[lum.length - 1][0].toFixed(1) + " 100Z"
      : "");
    marksEl.textContent = "";
    Object.keys(game.moments).forEach(function (key) {
      var k = Number(key);
      var b = el("button", "eg-mark");
      b.type = "button";
      b.style.setProperty("--x", (xOf(k) / 10) + "%");
      b.setAttribute("aria-label", "Jump to " + moveLabel(game, k));
      b.title = moveLabel(game, k);
      b.addEventListener("click", function (e) { e.stopPropagation(); stop(); go(k, false); });
      marksEl.appendChild(b);
    });
    // the lines are uncovered from the left when a game is opened
    if (motion && drawEl) {
      drawEl.classList.remove("is-timed");
      drawEl.style.setProperty("--draw", "0");
      void drawEl.offsetWidth;
      drawEl.classList.add("is-timed");
      drawEl.style.setProperty("--draw", "1");
    }
  }
  function placeCursor() {
    var c = $("cursor");
    c.style.setProperty("--x", ((ply < 0 ? 0 : xOf(ply)) / 10) + "%");
    c.classList.toggle("is-hidden", ply < 0);
  }
  function plyAt(clientX) {
    var r = plot.getBoundingClientRect();
    var t = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    return Math.round(t * (game.plies.length - 1));
  }

  /* ---------- navigation ---------- */
  function go(k, animate) {
    if (!game) return;
    k = Math.max(-1, Math.min(game.plies.length - 1, k));
    var fen = k < 0 ? game.startFen : game.plies[k].fen;
    var step = Math.abs(k - ply) === 1;
    ply = k;
    if (atkSq >= 0) { var held = atkSq; atkSq = -2; light(held); }     // the position changed under the pointer
    if (animate && step) board.set(fen, true);
    else board.instant(function () { board.set(fen, false); });
    if (k < 0) board.mark(null);
    else board.mark(game.plies[k].uci, /[+#]$/.test(game.plies[k].san), whiteMoved(game, k));
    var l = latest("l"), s = latest("s");
    var L = showEval("lum", l), S = showEval("stash", s);
    showGap(l, s, L, S);
    showMoment();
    showMove();
    placeCursor();
    if (evalFill) {
      var white = L ? (game.white === "Luminex" ? L.cp : -L.cp) : 0;
      evalFill.style.setProperty("--e", (1 / (1 + Math.exp(-white / 260))).toFixed(3));
    }
  }
  function setPlaying(on) {
    playing = on;
    playBtn.setAttribute("aria-label", on ? "Pause" : "Play");
    playBtn.querySelector("use").setAttribute("href", on ? "#i-pause" : "#i-play");
    root.classList.toggle("is-playing", on);
    clearTimeout(timer);
    if (on) schedule();
  }
  function stop() { if (playing) setPlaying(false); }
  function schedule() {
    var wait = game.moments[String(ply)] ? 3200 : 900;
    timer = setTimeout(function () {
      if (!playing) return;
      if (ply >= game.plies.length - 1) { setPlaying(false); return; }
      go(ply + 1, true);
      schedule();
    }, ply < 0 ? 500 : wait);
  }
  function togglePlay() {
    if (playing) { setPlaying(false); return; }
    if (ply >= game.plies.length - 1) go(-1, false);
    setPlaying(true);
  }

  /* ---------- building a game ---------- */
  function buildMoves() {
    movesEl.textContent = "";
    moveButtons = [];
    var li = null;
    game.plies.forEach(function (p, k) {
      var white = whiteMoved(game, k);
      if (white || !li) {
        li = el("li", "mv-row");
        li.appendChild(el("span", "mv-n", moveNumber(game, k) + "."));
        if (!white) li.appendChild(el("span", "mv-skip", "…"));
        movesEl.appendChild(li);
      }
      var b = el("button", "mv", p.san);
      b.type = "button";
      if (game.moments[String(k)]) b.classList.add("is-moment");
      b.addEventListener("click", function () { stop(); go(k, false); });
      li.appendChild(b);
      moveButtons.push(b);
    });
  }
  function buildChips() {
    chipsEl.textContent = "";
    Object.keys(game.moments).map(Number).sort(function (a, b) { return a - b; }).forEach(function (k) {
      var b = el("button", "chip", moveLabel(game, k));
      b.type = "button";
      b.addEventListener("click", function () { stop(); go(k, false); });
      chipsEl.appendChild(b);
    });
  }
  function load(index) {
    stop();
    gi = index;
    game = games[index];
    tabs.forEach(function (t, i) { t.setAttribute("aria-pressed", i === index ? "true" : "false"); });
    var lumWhite = game.white === "Luminex";
    board.instant(function () { board.setFlipped(!lumWhite); });   // Luminex at the bottom
    $("white").textContent = game.white;
    $("black").textContent = game.black;
    $("white").className = lumWhite ? "p-lum" : "p-stash";
    $("black").className = lumWhite ? "p-stash" : "p-lum";
    $("result").textContent = game.result.replace("-", "–");
    $("title").textContent = game.title;
    $("story").textContent = game.story;
    $("opening").textContent = "Opening: " + game.opening + ".";
    $("lum-side").textContent = lumWhite ? "White" : "Black";
    $("stash-side").textContent = lumWhite ? "Black" : "White";
    $("opp-name").textContent = lumWhite ? game.black : game.white;
    // the game is one of a whole match: the link goes to all of it
    var m = game.match, matchLink = $("match");
    drawField(m);
    if (!themeWatch && window.MutationObserver) {           // the cells take the theme's colours: draw them again when it changes
      themeWatch = new MutationObserver(function () { if (game) drawField(game.match); });
      themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    }
    atkSq = -2; light(-1);
    matchLink.parentNode.hidden = !m;
    if (m) {
      matchLink.href = m.href;
      matchLink.firstElementChild.textContent = "All " + m.games.toLocaleString("en-US") + " games of test " + m.test + " on OpenBench";
    }
    buildMoves();
    buildChips();
    drawGraph();
    ply = -2;
    go(-1, false);
    if (motion) {
      root.classList.remove("is-swapped");
      void root.offsetWidth;
      root.classList.add("is-swapped");
    }
  }

  function start(data) {
    games = data;
    boardEl.tabIndex = 0;   // click the board, then step with the arrow keys
    tabsEl.textContent = "";
    tabs = games.map(function (g, i) {
      var t = el("button", "vtab");
      t.type = "button";
      t.appendChild(el("span", "vtab-n", String(i + 1)));
      t.appendChild(el("span", null, g.title));
      t.setAttribute("aria-pressed", "false");
      t.addEventListener("click", function () { if (i !== gi || !game) load(i); });
      tabsEl.appendChild(t);
      return t;
    });
    Array.prototype.forEach.call(root.querySelectorAll(".vc"), function (b) {
      b.addEventListener("click", function () {
        var act = b.getAttribute("data-act");
        if (act === "play") { togglePlay(); return; }
        if (act === "flip") { board.flip(); return; }
        stop();
        if (act === "first") go(-1, false);
        else if (act === "prev") go(ply - 1, true);
        else if (act === "next") go(ply + 1, true);
        else if (act === "last") go(game.plies.length - 1, false);
      });
    });
    root.addEventListener("keydown", function (e) {
      if (!game || e.altKey || e.ctrlKey || e.metaKey) return;
      var t = e.target;
      if (t.closest && t.closest(".viewer-tabs")) return;   // let tab buttons keep Space and Enter
      var k = e.key;
      if (k === "ArrowRight") { stop(); go(ply + 1, true); }
      else if (k === "ArrowLeft") { stop(); go(ply - 1, true); }
      else if (k === "Home") { stop(); go(-1, false); }
      else if (k === "End") { stop(); go(game.plies.length - 1, false); }
      else if (k === " " && !(t.tagName === "BUTTON" && t !== playBtn)) { togglePlay(); }
      else if (k === "f" || k === "F") { board.flip(); }
      else return;
      e.preventDefault();
    });
    var dragging = false;
    plot.addEventListener("pointerdown", function (e) {
      if (!game || e.button > 0 || e.target.closest(".eg-mark")) return;
      dragging = true;
      stop();
      if (plot.setPointerCapture) plot.setPointerCapture(e.pointerId);
      go(plyAt(e.clientX), false);
    });
    plot.addEventListener("pointermove", function (e) {
      if (dragging) { var k = plyAt(e.clientX); if (k !== ply) go(k, false); }
    });
    function endDrag() { dragging = false; }
    plot.addEventListener("pointerup", endDrag);
    plot.addEventListener("pointercancel", endDrag);

    // pause when the viewer leaves the screen or the tab is hidden
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) { if (!entries[entries.length - 1].isIntersecting) stop(); }).observe(root);
    }
    document.addEventListener("visibilitychange", function () { if (document.hidden) stop(); });
    root.classList.add("is-loaded");
    heroField();
    // a link can open a game: /games/#2
    var want = parseInt((location.hash || "").replace("#", ""), 10);
    load(want >= 1 && want <= games.length ? want - 1 : 0);
  }

  /* ---------- the hero: every game of both matches, their wins lit ----------
     One square a game, in boards of eight by eight, dark and light like a real board: dark for a loss,
     half lit for a draw, lit for a win. The order inside a match is the seeded scatter every field of
     cells uses (the bench keeps counts, not an order), the same picture as the field beside each game.
     The first win of each match stands for the game shown, and is a button that opens it. */
  function heroField() {
    var box = document.querySelector("[data-gfield]");
    if (!box || !Lux.cells) return;
    var C = Lux.cells, ms = games.map(function (g) { return g.match; });
    if (ms.some(function (m) { return !m; })) return;
    box.hidden = false;
    box.setAttribute("role", "group");
    box.setAttribute("aria-label", "Every game of both matches, one square a game; a win of each, the game shown below, is a button");
    var parts = games.map(function (g, i) {
      var m = g.match, opp = g.white === "Luminex" ? g.black : g.white;
      var wrap = el("div", "gf-match"), frame = el("div", "gf-frame"), cv = el("canvas", "gf-canvas");
      cv.setAttribute("aria-hidden", "true");
      frame.appendChild(cv);
      var cells = C.scatter({ id: m.test, k: "g", w: m.wins, d: m.draws, l: m.losses });
      var win = -1;
      for (var k = 0; k < cells.length; k++) if (cells[k] === C.WIN) { win = k; break; }
      var btn = el("button", "gf-win");
      btn.type = "button";
      btn.setAttribute("aria-label", "Open the win against " + opp + ": " + g.title);
      btn.appendChild(el("span", "gf-dot"));
      btn.appendChild(el("span", "gf-win-tip", g.title));
      btn.addEventListener("click", function () {
        if (i !== gi || !game) load(i);
        root.scrollIntoView({ behavior: motion ? "smooth" : "auto", block: "start" });
      });
      frame.appendChild(btn);
      var cap = el("p", "gf-cap");
      cap.appendChild(el("b", "", opp));
      cap.appendChild(el("span", "", m.games.toLocaleString("en-US") + " games · " + m.wins + (m.wins === 1 ? " win · " : " wins · ") +
                                     m.draws + " draws · " + m.losses + " losses"));
      wrap.appendChild(frame); wrap.appendChild(cap);
      box.appendChild(wrap);
      return { cv: cv, btn: btn, cells: cells, win: win, frame: frame };
    });
    var hint = el("p", "try gf-try");
    hint.setAttribute("aria-hidden", "true");
    [["try-n", "01 · To try"], ["", "Find the two ringed lights"], ["", "·"], ["", "each one opens its game"]]
      .forEach(function (h) { hint.appendChild(el("span", h[0], h[1])); });
    box.appendChild(hint);

    var B = 8, PER = 7, t0 = 0, raf = 0;
    function layout(n, w) {
      var boards = Math.ceil(n / 64), per = Math.min(PER, boards), rows = Math.ceil(boards / per);
      var cs = Math.max(3, Math.floor((w / (per * B + per - 1)) * 4) / 4);
      return { boards: boards, per: per, rows: rows, cs: cs, w: (per * B + per - 1) * cs, h: (rows * B + rows - 1) * cs };
    }
    function xy(k, L) {
      var b = (k / 64) | 0, r = k % 64, bx = b % L.per, by = (b / L.per) | 0;
      return [(bx * (B + 1) + (r % 8)) * L.cs, (by * (B + 1) + ((r / 8) | 0)) * L.cs, (r % 8 + ((r / 8) | 0)) & 1];
    }
    function paint(p, upTo) {
      var w = Math.floor(p.frame.clientWidth) || 480, L = layout(p.cells.length, w), dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (p.L === undefined || p.L.cs !== L.cs) {
        p.L = L;
        p.cv.width = Math.round(L.w * dpr); p.cv.height = Math.round(L.h * dpr);
        p.cv.style.setProperty("--w", L.w + "px"); p.cv.style.setProperty("--h", L.h + "px");
        var at = xy(p.win, L);
        p.btn.style.setProperty("--x", at[0] + "px"); p.btn.style.setProperty("--y", at[1] + "px"); p.btn.style.setProperty("--s", L.cs + "px");
      }
      var c = p.cv.getContext("2d"), pal = C.palette(box), gap = Math.max(0.5, L.cs * 0.12);
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.clearRect(0, 0, L.w, L.h);
      var n = Math.min(p.cells.length, upTo);
      for (var k = 0; k < n; k++) {
        var v = p.cells[k], q = xy(k, L);
        c.fillStyle = (q[2] ? pal.alt : pal.css)[k === p.win ? C.DRAW : v];   // the game's own square is the button's to light
        c.fillRect(q[0] + gap / 2, q[1] + gap / 2, L.cs - gap, L.cs - gap);
      }
    }
    function all() { parts.forEach(function (p) { paint(p, Infinity); }); }
    // the boards fill in one after another, then the two games' own squares light
    function grow(now) {
      if (!t0) t0 = now;
      var f = Math.min(1, (now - t0) / 1400), done = true;
      parts.forEach(function (p) { var upTo = Math.ceil(p.cells.length * f / 64) * 64; paint(p, upTo); if (upTo < p.cells.length) done = false; });
      if (!done) { raf = requestAnimationFrame(grow); return; }
      box.classList.add("is-lit");
    }
    if (motion) {
      parts.forEach(function (p) { paint(p, 0); });
      Lux.onVisible(box, function () { raf = requestAnimationFrame(grow); }, 0.2);
    } else { all(); box.classList.add("is-lit"); }
    var rt = 0;
    window.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(function () { parts.forEach(function (p) { p.L = undefined; }); if (box.classList.contains("is-lit")) all(); }, 120); });
    if (window.MutationObserver) {
      new MutationObserver(function () { if (box.classList.contains("is-lit")) all(); }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    }
  }

  function fail() {
    $("title").textContent = "The games could not be loaded.";
    $("story").textContent = "You can still download them as PGN below.";
  }

  fetch(root.getAttribute("data-src"), { credentials: "same-origin" })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (data) {
      if (!Array.isArray(data) || !data.length) throw new Error("empty");
      start(data);
    })
    .catch(fail);
})();
