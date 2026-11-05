/* luminexchess.com: game viewer. Replays games from /assets/data/games.json with
   both engines' own evaluations. Each ply carries the position after the move, so
   no chess rules are needed here. */
(function () {
  "use strict";

  var root = document.querySelector(".viewer");
  if (!root || !window.fetch || !document.querySelector) return;

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  var FILES = "abcdefgh";

  function $(name) { return root.querySelector('[data-v="' + name + '"]'); }
  var tabsEl = root.querySelector(".viewer-tabs");
  var board = root.querySelector(".board");
  var movesEl = $("moves");
  var chipsEl = $("chips");
  var plot = $("plot");
  var marksEl = $("marks");
  var playBtn = root.querySelector('[data-act="play"]');

  var games = [];
  var game = null;     // the game on the board
  var gi = 0;          // its index
  var ply = -1;        // -1 = starting position, k = after ply k
  var flipped = false;
  var playing = false;
  var timer = 0;
  var live = [];       // pieces on the board: {el, p, f, r}
  var hlFrom, hlTo, hlCheck;
  var moveButtons = [];

  /* ---------- small helpers ---------- */

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function moveNumber(g, k) {
    return g.startMove + Math.floor((k + (g.whiteFirst ? 0 : 1)) / 2);
  }
  function whiteMoved(g, k) {
    return g.whiteFirst ? k % 2 === 0 : k % 2 === 1;
  }
  function moveLabel(g, k) {
    return moveNumber(g, k) + (whiteMoved(g, k) ? "." : "...") + g.plies[k].san;
  }

  // the engine's score for its own side: positive means it thinks it is better
  function ownSign(g, by) {
    var lumWhite = g.white === "Luminex";
    return (by === "l") === lumWhite ? 1 : -1;
  }

  function formatScore(g, p) {
    var s = ownSign(g, p.by);
    if (p.mate !== null) {
      var m = p.mate * s;
      if (m === 0) return { text: "#", meta: "checkmate" };
      var n = Math.ceil(Math.abs(m) / 2);   // mate scores are stored in plies
      return { text: (m > 0 ? "+M" : "−M") + n, meta: m > 0 ? "mates in " + n : "mated in " + n };
    }
    var v = (p.cp * s) / 100;
    var sign = v > 0 ? "+" : v < 0 ? "−" : "";
    return { text: sign + Math.abs(v).toFixed(2), meta: "depth " + p.depth };
  }

  // score from Luminex's side, squashed to [-1, 1] for the graph
  function lumValue(g, p) {
    var lumWhite = g.white === "Luminex";
    var s = lumWhite ? 1 : -1;
    if (p.mate !== null) {
      var m = p.mate * s;
      if (m === 0) m = (p.by === "l") ? 1 : -1;   // the mover delivered mate
      return m > 0 ? 1 : -1;
    }
    return Math.tanh((p.cp * s) / 350);
  }

  /* ---------- board ---------- */

  function parsePlacement(fen) {
    var out = [], rows = fen.split("/");
    for (var r = 0; r < 8; r++) {
      var f = 0, row = rows[r] || "";
      for (var i = 0; i < row.length; i++) {
        var c = row.charAt(i);
        if (c >= "1" && c <= "8") { f += c.charCodeAt(0) - 48; continue; }
        var up = c.toUpperCase();
        out.push({ p: (c === up ? "w" : "b") + up, f: f, r: r });
        f++;
      }
    }
    return out;
  }

  function setSquare(e, f, r) {
    e.style.setProperty("--x", flipped ? 7 - f : f);
    e.style.setProperty("--y", flipped ? 7 - r : r);
  }

  function makePiece(p) {
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "pc " + (p.charAt(0) === "w" ? "w" : "b"));
    svg.setAttribute("viewBox", "0 0 45 45");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    var use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttribute("href", "#p-" + p.charAt(1));
    svg.appendChild(use);
    return svg;
  }

  function buildBoard() {
    board.textContent = "";
    hlFrom = el("span", "hl");
    hlTo = el("span", "hl");
    hlCheck = el("span", "hl hl-check");
    hlFrom.hidden = hlTo.hidden = hlCheck.hidden = true;
    board.appendChild(hlFrom);
    board.appendChild(hlTo);
    board.appendChild(hlCheck);
    for (var i = 0; i < 8; i++) {
      board.appendChild(el("span", "coord coord-f"));
      board.appendChild(el("span", "coord coord-r"));
    }
    live = [];
  }

  function placeCoords() {
    var files = board.querySelectorAll(".coord-f");
    var ranks = board.querySelectorAll(".coord-r");
    for (var i = 0; i < 8; i++) {
      // files along the bottom row, ranks along the left column (as seen on screen)
      var f = flipped ? 7 - i : i;
      files[i].textContent = FILES.charAt(f);
      files[i].style.setProperty("--x", i);
      files[i].style.setProperty("--y", 7);
      files[i].classList.toggle("on-light", (i + 7) % 2 === 0);
      var rank = flipped ? i + 1 : 8 - i;
      ranks[i].textContent = rank;
      ranks[i].style.setProperty("--x", 0);
      ranks[i].style.setProperty("--y", i);
      ranks[i].classList.toggle("on-light", i % 2 === 0);
    }
  }

  function instant(fn) {
    board.classList.add("is-instant");
    fn();
    void board.offsetWidth;   // flush styles so the jump is not animated
    board.classList.remove("is-instant");
  }

  // Move the pieces on the board to `fen`, sliding pieces that stay the same type.
  function setPosition(fen, animate) {
    var next = parsePlacement(fen);
    var used = [], assign = [], i, j;
    for (j = 0; j < live.length; j++) used.push(false);
    for (i = 0; i < next.length; i++) {      // unchanged pieces first
      for (j = 0; j < live.length; j++) {
        if (!used[j] && live[j].p === next[i].p && live[j].f === next[i].f && live[j].r === next[i].r) {
          used[j] = true; assign[i] = j; break;
        }
      }
    }
    for (i = 0; i < next.length; i++) {      // then the nearest piece of the same type
      if (assign[i] !== undefined) continue;
      var best = -1, bd = 1e9;
      for (j = 0; j < live.length; j++) {
        if (used[j] || live[j].p !== next[i].p) continue;
        var d = Math.pow(live[j].f - next[i].f, 2) + Math.pow(live[j].r - next[i].r, 2);
        if (d < bd) { bd = d; best = j; }
      }
      if (best >= 0) { used[best] = true; assign[i] = best; }
    }
    var moved = [], born = [], out = [];
    for (i = 0; i < next.length; i++) {
      var item;
      if (assign[i] !== undefined) {
        item = live[assign[i]];
        if (item.f !== next[i].f || item.r !== next[i].r) moved.push(item);
        item.f = next[i].f; item.r = next[i].r;
      } else {
        item = { el: makePiece(next[i].p), p: next[i].p, f: next[i].f, r: next[i].r };
        born.push(item);
      }
      setSquare(item.el, item.f, item.r);
      out.push(item);
    }
    var gone = [];
    for (j = 0; j < live.length; j++) if (!used[j]) gone.push(live[j].el);
    live = out;

    var anim = animate && !reduceMotion.matches;
    born.forEach(function (it) {
      if (anim) it.el.classList.add("is-new");
      board.appendChild(it.el);
    });
    if (anim) {
      void board.offsetWidth;
      born.forEach(function (it) { it.el.classList.remove("is-new"); });
      moved.forEach(function (it) {
        it.el.classList.add("is-moving");
        setTimeout(function () { it.el.classList.remove("is-moving"); }, 320);
      });
      gone.forEach(function (e) {
        e.classList.add("is-gone");
        setTimeout(function () { if (e.parentNode) e.parentNode.removeChild(e); }, 260);
      });
    } else {
      gone.forEach(function (e) { if (e.parentNode) e.parentNode.removeChild(e); });
    }
  }

  function squareOf(name) {
    return { f: name.charCodeAt(0) - 97, r: 8 - (name.charCodeAt(1) - 48) };
  }

  function placeHighlights() {
    if (ply < 0) {
      hlFrom.hidden = hlTo.hidden = hlCheck.hidden = true;
      return;
    }
    var p = game.plies[ply];
    var a = squareOf(p.uci.slice(0, 2)), b = squareOf(p.uci.slice(2, 4));
    setSquare(hlFrom, a.f, a.r);
    setSquare(hlTo, b.f, b.r);
    hlFrom.hidden = hlTo.hidden = false;
    var check = /[+#]$/.test(p.san);
    hlCheck.hidden = !check;
    if (check) {
      var king = whiteMoved(game, ply) ? "bK" : "wK";   // the side to move is in check
      for (var i = 0; i < live.length; i++) {
        if (live[i].p === king) { setSquare(hlCheck, live[i].f, live[i].r); break; }
      }
    }
  }

  /* ---------- side panel ---------- */

  function latest(by) {
    for (var k = ply; k >= 0; k--) if (game.plies[k].by === by) return game.plies[k];
    return null;
  }

  function showEval(prefix, p) {
    var score = $(prefix + "-score"), meta = $(prefix + "-meta");
    if (!p) { score.textContent = "–"; meta.textContent = "its own score"; return; }
    var s = formatScore(game, p);
    score.textContent = s.text;
    meta.textContent = "its own score, " + s.meta;
  }

  function showGap(l, s) {
    var gap = $("gap");
    if (!l || !s || l.mate !== null || s.mate !== null) { gap.textContent = ""; return; }
    var sl = ownSign(game, "l"), ss = ownSign(game, "s");
    var lum = (l.cp * sl) / 100, stash = (s.cp * ss) / 100;   // each engine, its own side
    var diff = Math.abs(lum + stash);                          // same position, opposite sides
    gap.textContent = diff >= 1.5 ? "The two engines disagree by " + diff.toFixed(1) + " pawns." : "";
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
    if (ply >= 0) scrollMoveIntoView(moveButtons[ply]);
    else movesEl.scrollTop = 0;
    board.setAttribute("aria-label", ply < 0
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
      var pt = [xOf(k), yOf(lumValue(game, p))];
      (p.by === "l" ? lum : stash).push(pt);
    });
    function line(pts) {
      return pts.map(function (q, i) { return (i ? "L" : "M") + q[0].toFixed(1) + " " + q[1].toFixed(1); }).join("");
    }
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
  }

  function placeCursor() {
    var c = $("cursor"), x = ply < 0 ? 0 : xOf(ply);
    c.setAttribute("x1", x.toFixed(1));
    c.setAttribute("x2", x.toFixed(1));
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
    if (animate && step) setPosition(fen, true);
    else instant(function () { setPosition(fen, false); });
    placeHighlights();
    showEval("lum", latest("l"));
    showEval("stash", latest("s"));
    showGap(latest("l"), latest("s"));
    showMoment();
    showMove();
    placeCursor();
  }

  function setPlaying(on) {
    playing = on;
    playBtn.setAttribute("aria-label", on ? "Pause" : "Play");
    playBtn.querySelector("use").setAttribute("href", on ? "#i-pause" : "#i-play");
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

  function flip() {
    flipped = !flipped;
    instant(function () {
      live.forEach(function (it) { setSquare(it.el, it.f, it.r); });
      placeCoords();
      placeHighlights();
    });
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
    tabsEl.querySelectorAll(".vtab").forEach(function (t, i) {
      t.setAttribute("aria-pressed", i === index ? "true" : "false");
    });
    var lumWhite = game.white === "Luminex";
    flipped = !lumWhite;   // Luminex at the bottom
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
    buildBoard();
    placeCoords();
    buildMoves();
    buildChips();
    drawGraph();
    ply = -1;
    go(-1, false);
  }

  function start(data) {
    games = data;
    board.tabIndex = 0;   // click the board, then step with the arrow keys
    tabsEl.textContent = "";
    games.forEach(function (g, i) {
      var t = el("button", "vtab", g.title);
      t.type = "button";
      t.setAttribute("aria-pressed", "false");
      t.addEventListener("click", function () { if (i !== gi || !game) load(i); });
      tabsEl.appendChild(t);
    });
    root.querySelectorAll(".vc").forEach(function (b) {
      b.addEventListener("click", function () {
        var act = b.getAttribute("data-act");
        if (act === "play") { togglePlay(); return; }
        if (act === "flip") { flip(); return; }
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
      else if (k === "f" || k === "F") { flip(); }
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
      new IntersectionObserver(function (entries) {
        if (!entries[0].isIntersecting) stop();
      }).observe(root);
    }
    document.addEventListener("visibilitychange", function () { if (document.hidden) stop(); });
    root.classList.add("is-loaded");
    load(0);
  }

  function fail() {
    $("title").textContent = "The games could not be loaded.";
    $("story").textContent = "You can still download them as PGN below.";
  }

  function fetchGames() {
    fetch(root.getAttribute("data-src"), { credentials: "same-origin" })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (data) {
        if (!Array.isArray(data) || !data.length) throw new Error("empty");
        start(data);
      })
      .catch(fail);
  }

  // load the data once the viewer is near the screen
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) { io.disconnect(); fetchGames(); }
    }, { rootMargin: "900px 0px" });
    io.observe(root);
  } else {
    fetchGames();
  }
})();
