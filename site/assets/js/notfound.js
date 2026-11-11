/* luminexchess.com: the page that is not there. A lone knight makes a few hops
   by itself, then moves wherever a legal move is clicked. */
(function () {
  "use strict";

  var Lux = window.Lux;
  if (!Lux || !Lux.Board) return;
  var boardEl = Lux.$("[data-knight]");
  if (!boardEl) return;

  var board = new Lux.Board(boardEl, {});
  var JUMPS = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]];
  var at = { f: 1, r: 7 }, busy = false, seen = { "1,7": 1 };
  var dots = JUMPS.map(function () {
    var d = Lux.el("span", "nf-dot");
    d.setAttribute("aria-hidden", "true");
    boardEl.appendChild(d);
    return d;
  });

  function name(sq) { return "abcdefgh".charAt(sq.f) + (8 - sq.r); }
  function fenWith(sq) {
    var rows = [];
    for (var r = 0; r < 8; r++) rows.push(r === sq.r ? (sq.f ? sq.f : "") + "N" + (7 - sq.f ? 7 - sq.f : "") : "8");
    return rows.join("/");
  }
  function legal() {
    return JUMPS.map(function (j) { return { f: at.f + j[0], r: at.r + j[1] }; })
      .filter(function (s) { return s.f >= 0 && s.f < 8 && s.r >= 0 && s.r < 8; });
  }
  function showDots() {
    var moves = legal();
    dots.forEach(function (d, i) {
      var m = moves[i];
      d.classList.toggle("is-on", !!m);
      if (m) { d.style.setProperty("--x", m.f); d.style.setProperty("--y", m.r); }
    });
  }
  // an L: two squares along the long side first, then one across
  function hop(to, done) {
    if (busy) return;
    busy = true;
    boardEl.classList.remove("is-idle");
    var from = at, long = Math.abs(to.f - from.f) === 2;
    var corner = long ? { f: to.f, r: from.r } : { f: from.f, r: to.r };
    board.set(fenWith(corner), true);
    setTimeout(function () {
      board.set(fenWith(to), true);
      board.mark(name(from) + name(to));
      at = to;
      seen[to.f + "," + to.r] = 1;
      setTimeout(function () {
        busy = false;
        showDots();
        boardEl.classList.add("is-idle");
        if (done) done();
      }, 380);
    }, Lux.motion ? 300 : 0);
  }

  boardEl.addEventListener("click", function (e) {
    var r = boardEl.getBoundingClientRect(), sq = r.width / 8;
    var f = Math.floor((e.clientX - r.left) / sq), k = Math.floor((e.clientY - r.top) / sq);
    var target = legal().filter(function (s) { return s.f === f && s.r === k; })[0];
    if (target) hop(target);
  });

  showDots();
  boardEl.classList.add("is-idle");
  if (!Lux.motion) return;
  // a short walk on arrival, towards squares it has not stood on
  var left = 5;
  (function wander() {
    if (left-- <= 0) return;
    var moves = legal(), fresh = moves.filter(function (s) { return !seen[s.f + "," + s.r]; });
    var pool = fresh.length ? fresh : moves;
    var next = pool[Math.floor(Math.random() * pool.length)];
    setTimeout(function () { hop(next, wander); }, left === 4 ? 1500 : 420);
  })();
})();
