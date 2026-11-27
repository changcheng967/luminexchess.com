/* luminexchess.com: Luminex on Lichess. The bot account luminexbot plays there, and the home
   page's card "In public, on Lichess" shows it: the game it is playing (or its last one), the
   rating Lichess gives it at each time control with that rating's last thirty days, and every
   game it has played as a square of light (lit a win, half lit a draw, dark a loss).

   The card's markup is the copy tools/lichess.py took at the last build, and stands on its own.
   While the card is on screen this file reads Lichess's public API over it:

     /api/user/luminexbot                         the ratings and the record
     /api/games/user/luminexbot?since=T           the games finished after the copy
     /api/users/status?ids=luminexbot             whether it is online, and playing
     /api/user/luminexbot/current-game            which game, with its clock and opening
     /api/stream/game/ID                          its positions, as they are played

   Lichess asks for one request at a time and a minute's pause after a 429, and it sends a game
   in progress a few seconds late to everyone. Nothing is read while the card is off screen or
   the tab is hidden. */
(function () {
  "use strict";

  var Lux = window.Lux;
  if (!Lux) return;
  var card = Lux.$("[data-lichess]");
  if (!card) return;

  var $ = Lux.$, $$ = Lux.$$, el = Lux.el;
  var API = "https://lichess.org", BOT = "luminexbot";
  var POLL = 20000;                 // how often to ask whether a game has begun, while the card is seen
  var WINDOW = 30 * 86400;          // the ratings' histories: the last thirty days
  var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  var SPEED = { u: "UltraBullet", b: "Bullet", z: "Blitz", r: "Rapid", c: "Classical", o: "Correspondence" };
  var LETTER = { ultraBullet: "u", bullet: "b", blitz: "z", rapid: "r", classical: "c", correspondence: "o" };
  // a game in lichess.json is a row of these fields
  var ID = 0, AT = 1, SP = 2, CLK = 3, SIDE = 4, RES = 5, RATED = 6, OPP = 7, TITLE = 8, ORAT = 9, STATUS = 12, OPEN = 13;

  function hook(name) { return $('[data-l="' + name + '"]', card); }
  function fmt(n) { return Number(n).toLocaleString("en-US"); }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function day(t) { var d = new Date(t * 1000); return d.getUTCDate() + " " + MONTHS[d.getUTCMonth()]; }
  function hhmm(t) { var d = new Date(t * 1000); return pad(d.getUTCHours()) + ":" + pad(d.getUTCMinutes()); }
  function ago(t) {
    var s = Date.now() / 1000 - t;
    if (s < 90) return "just now";
    if (s < 3600) return Math.round(s / 60) + " minutes ago";
    if (s < 2 * 3600) return "an hour ago";
    if (s < 86400) return Math.round(s / 3600) + " hours ago";
    return "on " + day(t);
  }
  // Lichess's own way to write a clock: 1+1, 3+2, ½+0
  function clockText(initial, inc) {
    var m = initial / 60, frac = { 0.25: "¼", 0.5: "½", 0.75: "¾" };
    return (m === Math.floor(m) ? String(m) : (frac[m] || String(Math.round(m * 10) / 10))) + "+" + inc;
  }
  // how a game ended, from Luminex's side (tools/stamp.py says it the same way)
  function outcome(status, winner, me, opp) {
    if (!winner) return status === "stalemate" ? "A draw by stalemate" : "A draw";
    var won = winner.charAt(0) === me;
    if (status === "mate") return won ? "Luminex won by checkmate" : "Luminex was checkmated";
    if (status === "resign") return won ? "Luminex won: " + opp + " resigned" : "Luminex resigned";
    if (status === "outoftime") return won ? "Luminex won on time" : "Luminex lost on time";
    if (status === "timeout") return won ? "Luminex won: " + opp + " left the game" : "Luminex lost: it left the game";
    return won ? "Luminex won" : "Luminex lost";
  }
  function shortOutcome(res, opp) { return res === "W" ? "Won against " + opp : res === "L" ? "Lost to " + opp : "Drew with " + opp; }

  /* ---------- Lichess: one request at a time, a pause after a 429 ---------- */
  var pausedUntil = 0;
  function ask(path, accept, signal) {
    if (Date.now() < pausedUntil) return Promise.reject(new Error("paused"));
    var opts = { headers: { Accept: accept || "application/json" }, credentials: "omit" };
    if (signal) opts.signal = signal;
    return fetch(API + path, opts).then(function (res) {
      if (res.status === 429) { pausedUntil = Date.now() + 65000; throw new Error("429"); }
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res;
    });
  }
  function json(path) { return ask(path).then(function (r) { return r.json(); }); }
  // an answer of one JSON value a line, handed over line by line as it arrives
  function lines(res, onLine) {
    function each(text) {
      text.split("\n").forEach(function (s) { s = s.trim(); if (s) { try { onLine(JSON.parse(s)); } catch (e) { /* half a line */ } } });
    }
    if (!res.body || !res.body.getReader || !window.TextDecoder) return res.text().then(each);
    var reader = res.body.getReader(), dec = new TextDecoder(), buf = "";
    function pump() {
      return reader.read().then(function (r) {
        if (r.done) { each(buf + dec.decode()); return; }
        buf += dec.decode(r.value, { stream: true });
        var cut = buf.lastIndexOf("\n");
        if (cut >= 0) { var whole = buf.slice(0, cut); buf = buf.slice(cut + 1); each(whole); }
        return pump();
      });
    }
    return pump();
  }

  /* ---------- state ---------- */
  var snap = null, games = [], perfs = [], last = null, sinceMs = 0;
  var board = null, game = null;            // game: the one on the board (live or the last)
  var inView = false, running = false, busy = false, watching = false;
  var timer = 0, ctrl = null, tickTimer = 0, readAt = 0;

  // the still form draws the board from Black's side when luminexbot had Black: then a piece's row is its rank - 1
  function isFlipped(b) {
    var p = $(".pc", b);
    if (!p) return false;
    var rank = +p.getAttribute("data-sq").charAt(1), y = +((p.getAttribute("class").match(/\by(\d)\b/) || [0, 0])[1]);
    return y === rank - 1;
  }
  var boardEl = hook("board");
  if (boardEl && Lux.Board) board = new Lux.Board(boardEl, { flipped: isFlipped(boardEl), coords: true });

  /* ---------- the two players, the clocks, the lines under the board ---------- */
  function player(which, p, finished) {
    var row = hook(which);
    if (!row) return;
    var clock = hook(which + "-clock");
    row.textContent = "";
    var a = el("a", "lch-name", p.name);
    a.href = API + "/@/" + encodeURIComponent(p.name);
    row.appendChild(a);
    if (p.title) row.appendChild(el("span", "lch-title", p.title));
    if (p.rating != null) row.appendChild(el("span", "lch-rating num", String(p.rating)));
    if (finished && p.diff) {
      var d = el("span", "lch-diff num" + (p.diff < 0 ? " is-down" : ""), (p.diff > 0 ? "+" : "−") + Math.abs(p.diff));
      row.appendChild(d);
    }
    if (!clock) { clock = el("span", "lch-clock num"); clock.setAttribute("data-l", which + "-clock"); }
    clock.textContent = "";
    row.appendChild(clock);
  }
  function sideOf(players) { return ((players.white.user || {}).id === BOT) ? "w" : "b"; }
  function person(p) {
    var u = p.user || {};
    return { name: u.name || ("Stockfish level " + p.aiLevel), title: u.title || "", rating: p.rating, diff: p.ratingDiff };
  }
  function state(kind, text) {
    var s = hook("state"), t = hook("state-text");
    if (!s || !t) return;
    s.classList.toggle("is-live", kind === "live");
    s.classList.toggle("is-off", kind === "off");
    t.textContent = text;
  }
  function setText(name, text) { var n = hook(name); if (n) n.textContent = text; }
  function setWatch(id, live) {
    var a = hook("watch");
    if (!a) return;
    a.href = API + "/" + id;
    $("span", a).textContent = live ? "Watch it on Lichess" : "This game on Lichess";
  }
  function show(g) {
    // put a game on the board: its players, its position and how it stands
    game = g;
    var me = g.me, us = me === "w" ? g.white : g.black, them = me === "w" ? g.black : g.white;
    player("top", them, g.over);
    player("bottom", us, g.over);
    if (board) {
      board.setFlipped(me === "b");
      if (g.fen) board.instant(function () { this.set(g.fen, false); this.mark(g.lm || null, false); });
      boardEl.setAttribute("aria-label", (g.over ? "The last position of luminexbot against " : "The game in progress: luminexbot against ") + them.name);
    }
    var about = (SPEED[LETTER[g.speed]] || g.speed || "") + (g.clock ? " " + g.clock : "") + ", " + (g.rated ? "rated" : "casual");
    if (g.opening) about += " · " + g.opening;
    setText("about", about);
    setText("end", g.over ? outcome(g.status, g.winner, me, them.name) : "");
    setWatch(g.id, !g.over);
  }

  function fmtClock(s) {
    s = Math.max(0, s);
    if (s < 10) return "0:0" + s.toFixed(1);
    var m = Math.floor(s / 60), r = Math.floor(s - m * 60);
    return m + ":" + pad(r);
  }
  function clocks() {
    var top = hook("top-clock"), bottom = hook("bottom-clock");
    if (!game || game.over || game.wc == null) {
      if (top) { top.textContent = ""; top.classList.remove("is-run"); }
      if (bottom) { bottom.textContent = ""; bottom.classList.remove("is-run"); }
      return;
    }
    // Lichess starts the clocks once both sides have made a move
    var run = game.moves >= 2 ? (Date.now() - game.at) / 1000 : 0, wc = game.wc, bc = game.bc;
    if (game.turn === "w") wc -= run; else bc -= run;
    var mine = game.me === "w" ? wc : bc, theirs = game.me === "w" ? bc : wc;
    if (bottom) { bottom.textContent = fmtClock(mine); bottom.classList.toggle("is-run", game.turn === game.me); }
    if (top) { top.textContent = fmtClock(theirs); top.classList.toggle("is-run", game.turn !== game.me); }
  }
  function ticking(on) {
    clearInterval(tickTimer);
    tickTimer = on ? setInterval(clocks, 200) : 0;
    clocks();
  }

  /* ---------- ratings, with each one's last thirty days ---------- */
  function perfCell(key) { return $('.lch-perf[data-perf="' + key + '"]', card); }
  function odoOf(node) {
    if (!node) return null;
    if (!node._odo) {
      var o = Lux.odo(node);
      Lux.onVisible(node, function () { o.roll(); }, 0.5);
    }
    return node._odo;
  }
  $$(".lch-elo, .lch-rec [data-l]", card).forEach(odoOf);

  function sparks() {
    var now = Date.now() / 1000, t0 = now - WINDOW, lo = Infinity, hi = -Infinity;
    var series = perfs.map(function (p) {
      var before = null, pts = [];
      (p.history || []).forEach(function (h) {
        var t = Date.parse(h[0] + "T12:00:00Z") / 1000, q = { t: t, r: h[1], label: h[1] + " on " + day(t) };
        if (t < t0) before = q; else pts.push(q);
      });
      if (before) pts.unshift({ t: t0, r: before.r, label: before.r + " since " + day(before.t) });
      pts.push({ t: Math.max(now, pts.length ? pts[pts.length - 1].t : now), r: p.rating, label: p.rating + " now" });
      pts.forEach(function (q) { lo = Math.min(lo, q.r); hi = Math.max(hi, q.r); });
      return pts;
    });
    if (hi - lo < 40) { lo -= 20; hi += 20; }
    var span = hi - lo;
    lo -= span * 0.08; hi += span * 0.08;
    perfs.forEach(function (p, i) {
      var li = perfCell(p.key);
      if (!li) return;
      var box = $(".lch-spark", li);
      if (!box) {
        box = el("div", "lch-spark");
        box.setAttribute("aria-hidden", "true");
        var more = $(".lch-more", li);
        li.insertBefore(box, more);
        more.appendChild(el("span", "lch-at"));
      }
      draw(box, series[i], t0, now, lo, hi, li);
    });
  }
  var SVGNS = "http://www.w3.org/2000/svg";
  function draw(box, pts, t0, t1, lo, hi, li) {
    var w = Math.max(60, Math.floor(box.getBoundingClientRect().width)), h = 34;
    var X = function (t) { return 3 + (w - 6) * (t - t0) / (t1 - t0 || 1); }, Y = function (r) { return h - 3 - (h - 6) * (r - lo) / (hi - lo || 1); };
    var svg = document.createElementNS(SVGNS, "svg");
    svg.setAttribute("viewBox", "0 0 " + w + " " + h);
    svg.setAttribute("width", w); svg.setAttribute("height", h);
    svg.setAttribute("focusable", "false");
    var d = "";
    pts.forEach(function (q, k) {
      // the rating holds between games: a step, then the change
      if (k) d += "H" + X(q.t).toFixed(1);
      d += (k ? "V" : "M" + X(q.t).toFixed(1) + " ") + Y(q.r).toFixed(1);
    });
    var area = document.createElementNS(SVGNS, "path");
    area.setAttribute("class", "lch-sp-area");
    area.setAttribute("d", d + "V" + h + "H" + X(pts[0].t).toFixed(1) + "Z");
    var line = document.createElementNS(SVGNS, "path");
    line.setAttribute("class", "lch-sp-line");
    line.setAttribute("d", d);
    line.setAttribute("pathLength", "100");
    var end = pts[pts.length - 1], dot = document.createElementNS(SVGNS, "circle");
    dot.setAttribute("class", "lch-sp-dot");
    dot.setAttribute("cx", X(end.t).toFixed(1)); dot.setAttribute("cy", Y(end.r).toFixed(1)); dot.setAttribute("r", "4");
    var mark = document.createElementNS(SVGNS, "circle");
    mark.setAttribute("class", "lch-sp-mark");
    mark.setAttribute("r", "4");
    svg.appendChild(area); svg.appendChild(line); svg.appendChild(dot); svg.appendChild(mark);
    box.textContent = "";
    box.appendChild(svg);
    // pointing reads the rating at that day
    var at = $(".lch-at", li);
    box.onpointermove = function (e) {
      var x = e.clientX - box.getBoundingClientRect().left, best = pts[0];
      pts.forEach(function (q) { if (Math.abs(X(q.t) - x) < Math.abs(X(best.t) - x)) best = q; });
      mark.setAttribute("cx", X(best.t).toFixed(1)); mark.setAttribute("cy", Y(best.r).toFixed(1));
      if (at) at.textContent = best.label;
      li.classList.add("is-reading");
    };
    box.onpointerleave = function () { li.classList.remove("is-reading"); };
  }

  function applyUser(u) {
    var by = {};
    Object.keys(u.perfs || {}).forEach(function (k) { by[k] = u.perfs[k]; });
    perfs.forEach(function (p) {
      var q = by[p.key];
      if (!q) return;
      p.rating = q.rating; p.games = q.games; p.prov = !!q.prov;
      var li = perfCell(p.key);
      if (!li) return;
      var o = odoOf($(".lch-elo", li));
      if (o) o.set(String(q.rating) + (q.prov ? "?" : ""));
      var g = $('[data-l="games"]', li);
      if (g) g.textContent = fmt(q.games);
    });
    var c = u.count || {};
    [["all", c.all], ["win", c.win], ["draw", c.draw], ["loss", c.loss]].forEach(function (kv) {
      var n = $('.lch-rec [data-l="' + kv[0] + '"]', card);
      if (n && kv[1] != null) { var o = odoOf(n); if (o) o.set(fmt(kv[1])); }
    });
    var wdl = $(".lch-wdl", card);
    if (wdl && c.all) {
      var r = $$("rect", wdl);
      wdl.setAttribute("viewBox", "0 0 " + c.all + " 10");
      r[0].setAttribute("width", c.win);
      r[1].setAttribute("x", c.win); r[1].setAttribute("width", c.draw);
      r[2].setAttribute("x", c.win + c.draw); r[2].setAttribute("width", c.loss);
    }
    sparks();
  }

  /* ---------- every game, one square each, in boards of 64 ---------- */
  var F = null, B = 8;
  function rowOf(g) {
    var me = sideOf(g.players), us = g.players[me === "w" ? "white" : "black"], them = person(g.players[me === "w" ? "black" : "white"]);
    var c = g.clock || {}, w = g.winner;
    return [g.id, Math.floor(g.createdAt / 1000), LETTER[g.speed] || "?", c.initial != null ? clockText(c.initial, c.increment) : "", me,
            !w ? "D" : (w.charAt(0) === me ? "W" : "L"), g.rated ? 1 : 0, them.name, them.title, them.rating, us.rating, us.ratingDiff,
            g.status || "", (g.opening || {}).name || ""];
  }
  function who(r) { return r[OPP] + (r[ORAT] != null ? " (" + r[ORAT] + ")" : ""); }
  function describe(r) {
    return [SPEED[r[SP]] + (r[CLK] ? " " + r[CLK] : ""), r[RATED] ? "rated" : "casual", r[SIDE] === "w" ? "as White" : "as Black"];
  }
  function buildField() {
    var box = hook("field");
    if (!box || !Lux.cells || !games.length) return;
    box.hidden = false;
    card.classList.add("has-field");
    var frame = el("div", "lch-ff"), cv = el("canvas", "lch-fcv"), pick = el("a", "lch-pick"), now = el("span", "lch-now");
    var tip = el("div", "lch-tip"), say = el("p", "sr-only"), help = el("p", "sr-only");
    cv.setAttribute("aria-hidden", "true");
    now.setAttribute("aria-hidden", "true");
    tip.setAttribute("aria-hidden", "true");
    say.setAttribute("aria-live", "polite");
    help.id = "lch-field-help";
    help.textContent = "Every game as a square. Arrow keys move from game to game, Enter opens one on Lichess.";
    pick.setAttribute("aria-describedby", help.id);
    frame.appendChild(cv); frame.appendChild(now); frame.appendChild(pick); frame.appendChild(tip);
    var hint = el("p", "try lch-try");
    hint.setAttribute("aria-hidden", "true");
    [["try-n", "02 · To try"], ["", "Point at a square"], ["", "·"], ["", "each one is a game, and opens it on Lichess"]]
      .forEach(function (h) { hint.appendChild(el("span", h[0], h[1])); });
    box.appendChild(frame); box.appendChild(hint); box.appendChild(help); box.appendChild(say);
    F = { box: box, frame: frame, cv: cv, pick: pick, now: now, tip: tip, say: say, L: null, active: -1, shown: 0, grown: !Lux.motion, live: false, touch: false };

    // the pick is one real link that moves to the square pointed at; it is also the field's one tab stop
    frame.addEventListener("pointermove", function (e) {
      if (e.pointerType !== "mouse") return;
      var k = cellAt(e);
      if (k >= 0) select(k, false); else if (document.activeElement !== pick) hideTip();
    });
    frame.addEventListener("pointerleave", function () { if (document.activeElement !== pick) hideTip(); });
    // a first tap shows a game; a tap on it again opens it. The link reaches past its square, so a tap
    // that lands on it over a neighbouring square only moves it there
    var moved = false;
    frame.addEventListener("pointerdown", function (e) {
      F.touch = e.pointerType !== "mouse";
      moved = false;
      if (!F.touch) return;
      var k = cellAt(e);
      if (k >= 0 && (k !== F.active || !F.pick.classList.contains("is-on"))) { select(k, false); moved = true; }
    });
    pick.addEventListener("click", function (e) { if (moved) { e.preventDefault(); moved = false; } });
    pick.addEventListener("focus", function () { if (F.active < 0) select(games.length - 1, false); else select(F.active, false); });
    pick.addEventListener("blur", hideTip);
    pick.addEventListener("keydown", function (e) {
      var k = F.active, n = games.length;
      var to = { ArrowLeft: k - 1, ArrowRight: k + 1, ArrowUp: k - 8, ArrowDown: k + 8, Home: 0, End: n - 1, PageUp: k - 64, PageDown: k + 64 }[e.key];
      if (to === undefined) return;
      e.preventDefault();
      select(Math.max(0, Math.min(n - 1, to)), true);
    });
    if (window.ResizeObserver) new ResizeObserver(function () { paint(); }).observe(box);
    Lux.onVisible(frame, grow, 0.3);
    paint();
    aim(games.length - 1);
  }
  function layout(n, w) {
    var boards = Math.max(1, Math.ceil(n / 64)), per = boards, cs;
    for (;;) {
      cs = Math.floor(w / (per * B + per - 1));
      if (cs >= 10 || per === 1) break;
      per--;
    }
    cs = Math.max(4, Math.min(cs, 22));
    var rows = Math.ceil(boards / per);
    return { per: per, rows: rows, cs: cs, w: (per * B + per - 1) * cs, h: (rows * B + rows - 1) * cs };
  }
  function xy(k, L) {
    var b = (k / 64) | 0, r = k % 64, bx = b % L.per, by = (b / L.per) | 0;
    return { x: (bx * (B + 1) + (r % 8)) * L.cs, y: (by * (B + 1) + ((r / 8) | 0)) * L.cs, dark: ((r % 8) + ((r / 8) | 0)) & 1 };
  }
  function cellAt(e) {
    var L = F.L, rect = F.cv.getBoundingClientRect();
    if (!L) return -1;
    var cx = Math.floor((e.clientX - rect.left) / L.cs), cy = Math.floor((e.clientY - rect.top) / L.cs);
    if (cx < 0 || cy < 0) return -1;
    var bx = Math.floor(cx / (B + 1)), by = Math.floor(cy / (B + 1)), ix = cx % (B + 1), iy = cy % (B + 1);
    if (ix === B || iy === B || bx >= L.per) return -1;
    var k = (by * L.per + bx) * 64 + iy * 8 + ix;
    return k < games.length ? k : -1;
  }
  function paint() {
    if (!F) return;
    var n = games.length + (F.live ? 1 : 0), w = Math.floor(F.box.clientWidth) || 480, L = layout(n, w);
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (!F.L || F.L.cs !== L.cs || F.L.w !== L.w || F.L.h !== L.h) {
      F.cv.width = Math.round(L.w * dpr); F.cv.height = Math.round(L.h * dpr);
      F.cv.style.setProperty("--w", L.w + "px"); F.cv.style.setProperty("--h", L.h + "px");
      F.frame.style.setProperty("--w", L.w + "px"); F.frame.style.setProperty("--h", L.h + "px");
    }
    F.L = L;
    var C = Lux.cells, pal = C.palette(card), c = F.cv.getContext("2d"), gap = Math.max(1, Math.round(L.cs * 0.14));
    var glow = parseFloat(pal.v("--lit-glow", "1")) || 0, lum = pal.v("--lumen-rgb", "111, 230, 245");
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, L.w, L.h);
    // the empty squares of each board first, so a board shows how much of it is still to play
    var boards = Math.ceil(n / 64) * 64;
    for (var k = 0; k < boards; k++) {
      var q = xy(k, L), kind = k < F.shown ? ({ W: C.WIN, D: C.DRAW, L: C.LOSS })[games[k] ? games[k][RES] : "D"] : -1;
      if (k >= games.length) kind = -1;
      if (kind === -1) {
        c.fillStyle = q.dark ? pal.alt[C.GONE] : pal.css[C.GONE];
        c.globalAlpha = 0.5;
      } else {
        c.fillStyle = (q.dark ? pal.alt : pal.css)[kind];
        c.globalAlpha = 1;
      }
      if (kind === C.WIN && glow > 0 && L.cs >= 8) { c.shadowColor = "rgba(" + lum + "," + (0.75 * glow) + ")"; c.shadowBlur = L.cs * 0.7; }
      else c.shadowBlur = 0;
      c.fillRect(q.x + gap / 2, q.y + gap / 2, L.cs - gap, L.cs - gap);
    }
    c.globalAlpha = 1; c.shadowBlur = 0;
    // the game in progress: the next square, waiting
    F.now.hidden = !F.live;
    if (F.live) {
      var p = xy(games.length, L);
      F.now.style.setProperty("--x", p.x + "px"); F.now.style.setProperty("--y", p.y + "px"); F.now.style.setProperty("--s", L.cs + "px");
    }
    if (F.active >= 0) place(F.active);
  }
  function grow() {
    if (!F) return;
    if (F.grown) { F.shown = games.length; paint(); return; }
    var t0 = 0;
    function step(now) {
      if (!t0) t0 = now;
      var f = Math.min(1, (now - t0) / 1600);
      F.shown = f < 1 ? Math.ceil(games.length * (1 - Math.pow(1 - f, 2))) : games.length;
      paint();
      if (f < 1) requestAnimationFrame(step); else { F.grown = true; F.box.classList.add("is-lit"); }
    }
    requestAnimationFrame(step);
  }
  function place(k) {
    var L = F.L, q = xy(k, L);
    F.pick.style.setProperty("--x", q.x + "px"); F.pick.style.setProperty("--y", q.y + "px"); F.pick.style.setProperty("--s", L.cs + "px");
    F.tip.style.setProperty("--x", (q.x + L.cs / 2) + "px"); F.tip.style.setProperty("--y", q.y + "px");
    F.tip.classList.toggle("is-left", q.x > L.w * 0.62);
    F.tip.classList.toggle("is-right", q.x < L.w * 0.25);
  }
  // point the link at a game; select() also shows what it was
  function aim(k) {
    var r = games[k];
    if (!r) return null;
    F.active = k;
    F.pick.href = API + "/" + r[ID];
    var when = day(r[AT]) + " " + new Date(r[AT] * 1000).getUTCFullYear() + ", " + hhmm(r[AT]) + " UTC";
    var label = shortOutcome(r[RES], who(r)) + ", " + describe(r).join(", ") + ", " + when + (r[OPEN] ? ". " + r[OPEN] : "");
    F.pick.setAttribute("aria-label", label + ". Open the game on Lichess");
    F.tip.textContent = "";
    F.tip.appendChild(el("b", "lch-tip-h res-" + r[RES], shortOutcome(r[RES], who(r))));
    F.tip.appendChild(el("span", "lch-tip-m", describe(r).join(" · ")));
    if (r[OPEN]) F.tip.appendChild(el("span", "lch-tip-o", r[OPEN]));
    F.tip.appendChild(el("span", "lch-tip-d", when));
    place(k);
    return label;
  }
  function select(k, announce) {
    var label = aim(k);
    if (!label) return;
    F.tip.classList.add("is-on");
    F.pick.classList.add("is-on");
    if (announce) F.say.textContent = label;
  }
  function hideTip() { if (F) { F.tip.classList.remove("is-on"); F.pick.classList.remove("is-on"); } }
  function addGames(list) {
    // a game the export sends twice, or one the copy had, is kept once
    var have = {};
    games.forEach(function (r) { have[r[ID]] = true; });
    var fresh = list.filter(function (g) { return g.source !== "ai" && g.status !== "started" && g.status !== "created" && !have[g.id]; })
      .sort(function (a, b) { return a.createdAt - b.createdAt; });
    fresh.forEach(function (g) {
      games.push(rowOf(g));
      sinceMs = Math.max(sinceMs, g.createdAt + 1);
    });
    if (fresh.length) {
      var g = fresh[fresh.length - 1], c = g.clock || {};
      last = { id: g.id, fen: g.lastFen, lm: g.lastMove, status: g.status, winner: g.winner || "", speed: g.speed,
               clock: c.initial != null ? clockText(c.initial, c.increment) : "", rated: !!g.rated, side: sideOf(g.players),
               white: person(g.players.white), black: person(g.players.black), end: Math.floor((g.lastMoveAt || g.createdAt) / 1000),
               opening: (g.opening || {}).name || "" };
      if (F) {
        if (F.grown) F.shown = games.length;
        paint();
        if (Lux.motion) flash(games.length - 1);
      }
    }
    return fresh.length;
  }
  function flash(k) {
    var L = F.L, q = xy(k, L), f = el("span", "lch-flash");
    f.setAttribute("aria-hidden", "true");
    f.style.setProperty("--x", q.x + "px"); f.style.setProperty("--y", q.y + "px"); f.style.setProperty("--s", L.cs + "px");
    F.frame.appendChild(f);
    setTimeout(function () { if (f.parentNode) f.parentNode.removeChild(f); }, 2400);
  }

  /* ---------- the last game, when nothing is being played ---------- */
  function showLast() {
    if (!last) return;
    show({ id: last.id, me: last.side, white: last.white, black: last.black, fen: last.fen, lm: last.lm, over: true,
           status: last.status, winner: last.winner, speed: last.speed, clock: last.clock, rated: last.rated, opening: last.opening });
  }
  function idle(s) {
    watching = false;
    ticking(false);
    if (F && F.live) { F.live = false; paint(); }
    if (!game || !game.over || (last && game.id !== last.id)) showLast();
    var since = last ? "its last game ended " + ago(last.end) : "";
    if (!s) state("idle", last ? "Its last game, ended " + ago(last.end) : "");
    else if (s.online) state("idle", "Online, waiting for a challenge" + (since ? " · " + since : ""));
    else state("off", "Offline" + (since ? " · " + since : ""));
  }

  /* ---------- the game in progress ---------- */
  // info: the game as /api/user/luminexbot/current-game describes it (its clock and opening)
  function watch(id, info) {
    watching = true;
    var g = { id: id, me: "w", white: null, black: null, fen: null, lm: null, over: false, plies: 0, at: Date.now() };
    var c = (info && info.clock) || {};
    g.clock = c.initial != null ? clockText(c.initial, c.increment) : "";
    g.opening = ((info && info.opening) || {}).name || "";
    var shownAt = 0, queued = null, frame = 0;
    function render() {
      frame = 0;
      var m = queued;
      queued = null;
      if (!m || !board) return;
      var first = !shownAt;
      if (first) board.instant(function () { this.set(m.fen, false); });
      else board.set(m.fen, true);
      board.mark(m.lm || null, false);
      shownAt = Date.now();
      var move = +(m.fen.split(" ")[5] || 1);
      state("live", "Live · move " + move + " · a few seconds behind");
      clocks();
    }
    function onLine(m) {
      if (m.players) {
        // the game's description: first, and again when it ends
        g.me = sideOf(m.players);
        g.white = person(m.players.white); g.black = person(m.players.black);
        g.speed = m.speed; g.rated = !!m.rated;
        var st = m.status && m.status.name;
        if (st && st !== "started" && st !== "created") {
          g.over = true; g.status = st; g.winner = m.winner || "";
          if (m.fen) g.fen = m.fen;
        }
        if (!g.shown) { g.shown = true; show(g); if (F) { F.live = !g.over; paint(); } }
        else if (g.over) finish(g);
        return;
      }
      if (!m.fen) return;
      g.fen = m.fen; g.lm = m.lm; g.plies++;
      if (m.lm) g.moves = (g.moves || 0) + 1;
      g.turn = m.fen.split(" ")[1] || "w";
      if (m.wc != null) { g.wc = m.wc; g.bc = m.bc; g.at = Date.now(); }
      queued = m;
      if (!frame) frame = requestAnimationFrame(render);
    }
    ctrl = window.AbortController ? new AbortController() : null;
    ask("/api/stream/game/" + id, "application/x-ndjson", ctrl && ctrl.signal)
      .then(function (res) { ticking(true); return lines(res, onLine); })
      .then(function () {
        ctrl = null;
        if (!g.over) { watching = false; ticking(false); if (running) schedule(3000); }   // the stream closed early: look again
      }, function () {
        ctrl = null; watching = false; ticking(false);
        if (running) { offline(); schedule(POLL); }
      });
  }
  function finish(g) {
    ticking(false);
    show(g);
    state("idle", "The game has ended · " + outcome(g.status, g.winner, g.me, (g.me === "w" ? g.black : g.white).name));
    if (F) { F.live = false; paint(); }
    watching = false;
    // its result reaches the game list and the ratings a moment later
    schedule(4000, true);
  }

  /* ---------- the rounds ---------- */
  function readNote(ok) {
    var n = hook("read");
    if (!n) return;
    if (ok) { readAt = Date.now(); n.textContent = "Live from Lichess, read at " + hhmm(readAt / 1000) + " UTC"; card.classList.add("is-live-data"); }
    else if (!readAt && snap) n.textContent = "Lichess did not answer: this is the copy read on " + snap.readText;
  }
  function offline() { readNote(false); }
  function refresh() {
    return json("/api/user/" + BOT).then(function (u) {
      applyUser(u);
      readNote(true);
      // the games since the copy; if Lichess will not list them now, the next round asks again
      return ask("/api/games/user/" + BOT + "?since=" + sinceMs + "&max=300&moves=false&opening=true&lastFen=true&clocks=false&evals=false", "application/x-ndjson")
        .then(function (res) {
          var got = [];
          return lines(res, function (g) { got.push(g); }).then(function () { addGames(got); });
        }, function () { /* the ratings and the record are new already */ });
    });
  }
  var lastRefresh = 0;
  function cycle(force) {
    if (busy || watching || !running) return;
    busy = true;
    var need = force || Date.now() - lastRefresh > 60000;
    (need ? refresh().then(function () { lastRefresh = Date.now(); }) : Promise.resolve())
      .then(function () { return json("/api/users/status?ids=" + BOT + "&withGameIds=true"); })
      .then(function (a) {
        var s = a && a[0];
        readNote(true);
        // status says whether it is playing, but not always which game: current-game names it, with its clock and opening
        if (!s || !(s.playing || s.playingId)) return { s: s, info: null };
        return json("/api/user/" + BOT + "/current-game?moves=false&clocks=false&evals=false&opening=true")
          .then(function (info) { return { s: s, info: info }; }, function () { return { s: s, info: null }; });
      })
      .then(function (r) {
        busy = false;
        if (!running) return;
        var info = r.info;
        if (info && info.status === "started" && !(game && game.id === info.id && game.over)) watch(info.id, info);
        else { idle(r.s); schedule(POLL); }
      }, function () {
        busy = false;
        if (!running) return;
        offline();
        idle(null);
        schedule(Math.max(POLL * 3, pausedUntil - Date.now()));
      });
  }
  function schedule(ms, force) {
    clearTimeout(timer);
    timer = setTimeout(function () { timer = 0; cycle(force); }, ms);
  }
  function start() {
    if (running) return;
    running = true;
    cycle();
  }
  function stop() {
    if (!running) return;
    running = false;
    clearTimeout(timer); timer = 0;
    if (ctrl) { ctrl.abort(); ctrl = null; }
    watching = false;
    ticking(false);
  }
  function judge() { if (inView && !document.hidden) start(); else stop(); }

  /* ---------- the copy, then Lichess: both only once the card is a screen or so away ---------- */
  if (!window.fetch || !window.Promise) return;
  function near(fn) {
    if (!("IntersectionObserver" in window)) { fn(); return; }
    var io = new IntersectionObserver(function (en) {
      if (en[en.length - 1].isIntersecting) { io.disconnect(); fn(); }
    }, { rootMargin: "100% 0px" });
    io.observe(card);
  }
  near(function () { fetch("/assets/data/lichess.json").then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
    if (!d) return;
    snap = d;
    games = d.games.slice();
    perfs = d.perfs.map(function (p) { return { key: p.key, name: p.name, rating: p.rating, games: p.games, prov: p.prov, history: p.history }; });
    last = d.last;
    sinceMs = d.since + 1;
    showLast();
    buildField();
    sparks();
    if (window.ResizeObserver) {
      var rw = 0;
      new ResizeObserver(function (en) {
        var w = Math.round(en[0].contentRect.width);
        if (w !== rw) { rw = w; sparks(); }
      }).observe($(".lch-perfs", card) || card);
    }
    Lux.whileVisible(card, function (on) { inView = on; judge(); }, 0.05);
    document.addEventListener("visibilitychange", judge);
  }).catch(function () { /* the still form stays */ }); });
})();
