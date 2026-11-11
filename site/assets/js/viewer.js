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
    if (p.mate !== null) {
      var m = p.mate * s;
      if (m === 0) return { text: "#", meta: "checkmate", cp: 3000 };
      var n = Math.ceil(Math.abs(m) / 2);   // mate scores are stored in plies
      return { text: (m > 0 ? "+M" : "−M") + n, meta: m > 0 ? "mates in " + n : "mated in " + n, cp: m > 0 ? 3000 : -3000 };
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
      new IntersectionObserver(function (entries) { if (!entries[0].isIntersecting) stop(); }).observe(root);
    }
    document.addEventListener("visibilitychange", function () { if (document.hidden) stop(); });
    root.classList.add("is-loaded");
    // a link can open a game: /games/#2
    var want = parseInt((location.hash || "").replace("#", ""), 10);
    load(want >= 1 && want <= games.length ? want - 1 : 0);
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
