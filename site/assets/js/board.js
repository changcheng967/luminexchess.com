/* luminexchess.com: the board. Draws a position from the piece-placement field
   of a FEN and slides pieces between positions; it knows no chess rules, so
   every caller hands it complete positions. Pieces are <svg><use> elements
   placed by two custom properties, --x and --y, in squares from the top left. */
(function () {
  "use strict";

  var Lux = window.Lux;
  if (!Lux) return;
  var SVGNS = "http://www.w3.org/2000/svg";
  var FILES = "abcdefgh";

  Lux.START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR";

  function parse(fen) {
    var out = [], rows = fen.split(" ")[0].split("/");
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
  function squareOf(name) { return { f: name.charCodeAt(0) - 97, r: 8 - (name.charCodeAt(1) - 48) }; }

  // a plain move (no capture rules, castling or promotion) applied to a placement
  Lux.applyUci = function (fen, uci) {
    var grid = [], r, f;
    for (r = 0; r < 8; r++) { grid.push([]); for (f = 0; f < 8; f++) grid[r].push(""); }
    parse(fen).forEach(function (it) { grid[it.r][it.f] = it.p.charAt(0) === "w" ? it.p.charAt(1) : it.p.charAt(1).toLowerCase(); });
    var a = squareOf(uci.slice(0, 2)), b = squareOf(uci.slice(2, 4));
    grid[b.r][b.f] = grid[a.r][a.f];
    grid[a.r][a.f] = "";
    return grid.map(function (row) {
      var s = "", gap = 0;
      row.forEach(function (c) { if (!c) { gap++; } else { if (gap) { s += gap; gap = 0; } s += c; } });
      return s + (gap || "");
    }).join("/");
  };

  function Board(root, opts) {
    opts = opts || {};
    this.root = root;
    this.flipped = !!opts.flipped;
    this.live = [];                     // {el, p, f, r}
    var self = this;
    // pieces already in the markup (the position shown without scripts) are kept
    Lux.$$(".pc", root).forEach(function (svg) {
      var sq = svg.getAttribute("data-sq"), p = svg.getAttribute("data-p");
      if (!sq || !p) { root.removeChild(svg); return; }
      var at = squareOf(sq);
      self.live.push({ el: svg, p: p, f: at.f, r: at.r });
      self.place(svg, at.f, at.r);
    });
    this.hlFrom = Lux.el("span", "hl");
    this.hlTo = Lux.el("span", "hl");
    this.hlCheck = Lux.el("span", "hl hl-check");
    this.hlFrom.hidden = this.hlTo.hidden = this.hlCheck.hidden = true;
    root.insertBefore(this.hlCheck, root.firstChild);
    root.insertBefore(this.hlTo, root.firstChild);
    root.insertBefore(this.hlFrom, root.firstChild);
    this.coordEls = null;
    if (opts.coords) {
      this.coordEls = { f: [], r: [] };
      for (var i = 0; i < 8; i++) {
        var cf = Lux.el("span", "coord coord-f"), cr = Lux.el("span", "coord coord-r");
        cf.setAttribute("aria-hidden", "true"); cr.setAttribute("aria-hidden", "true");
        root.appendChild(cf); root.appendChild(cr);
        this.coordEls.f.push(cf); this.coordEls.r.push(cr);
      }
      this.placeCoords();
    }
  }

  Board.prototype.place = function (node, f, r) {
    node.style.setProperty("--x", this.flipped ? 7 - f : f);
    node.style.setProperty("--y", this.flipped ? 7 - r : r);
  };

  Board.prototype.placeCoords = function () {
    if (!this.coordEls) return;
    for (var i = 0; i < 8; i++) {
      // files along the bottom row, ranks down the left column, as seen on screen
      var cf = this.coordEls.f[i], cr = this.coordEls.r[i];
      cf.textContent = FILES.charAt(this.flipped ? 7 - i : i);
      cf.style.setProperty("--x", i); cf.style.setProperty("--y", 7);
      cf.classList.toggle("on-dark", (i + 7) % 2 === 1);
      cr.textContent = this.flipped ? i + 1 : 8 - i;
      cr.style.setProperty("--x", 0); cr.style.setProperty("--y", i);
      cr.classList.toggle("on-dark", i % 2 === 1);
    }
  };

  function makePiece(p) {
    var svg = document.createElementNS(SVGNS, "svg");
    svg.setAttribute("class", "pc " + (p.charAt(0) === "w" ? "w" : "b"));
    svg.setAttribute("viewBox", "0 0 45 45");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    var use = document.createElementNS(SVGNS, "use");
    use.setAttribute("href", "#p-" + p.charAt(1));
    svg.appendChild(use);
    return svg;
  }

  // run fn with transitions off, so the board jumps instead of sliding
  Board.prototype.instant = function (fn) {
    this.root.classList.add("is-instant");
    fn.call(this);
    void this.root.offsetWidth;
    this.root.classList.remove("is-instant");
  };

  // Move the pieces to `fen`. A piece that stays the same type slides; the
  // rest fade in or out. With animate false the caller should wrap in instant().
  Board.prototype.set = function (fen, animate) {
    var next = parse(fen), live = this.live, root = this.root, self = this;
    var used = [], assign = [], i, j;
    for (j = 0; j < live.length; j++) used.push(false);
    for (i = 0; i < next.length; i++) {      // pieces that did not move
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
      this.place(item.el, item.f, item.r);
      out.push(item);
    }
    var gone = [];
    for (j = 0; j < live.length; j++) if (!used[j]) gone.push(live[j].el);
    this.live = out;

    var anim = animate && Lux.motion;
    born.forEach(function (it) {
      if (anim) it.el.classList.add("is-new");
      root.appendChild(it.el);
    });
    if (anim) {
      void root.offsetWidth;
      born.forEach(function (it) { it.el.classList.remove("is-new"); });
      moved.forEach(function (it) {
        it.el.classList.add("is-moving");
        setTimeout(function () { it.el.classList.remove("is-moving"); }, 360);
      });
      gone.forEach(function (e) {
        e.classList.add("is-gone");
        setTimeout(function () { if (e.parentNode) e.parentNode.removeChild(e); }, 240);
      });
    } else {
      gone.forEach(function (e) { if (e.parentNode) e.parentNode.removeChild(e); });
    }
    return self;
  };

  // highlight a move's two squares; `check` marks the king of the side now to move
  Board.prototype.mark = function (uci, check, whiteMoved) {
    if (!uci) { this.hlFrom.hidden = this.hlTo.hidden = this.hlCheck.hidden = true; return; }
    var a = squareOf(uci.slice(0, 2)), b = squareOf(uci.slice(2, 4));
    this.place(this.hlFrom, a.f, a.r);
    this.place(this.hlTo, b.f, b.r);
    this.hlFrom.hidden = this.hlTo.hidden = false;
    this.hlCheck.hidden = !check;
    if (check) {
      var king = whiteMoved ? "bK" : "wK";
      for (var i = 0; i < this.live.length; i++) {
        if (this.live[i].p === king) { this.place(this.hlCheck, this.live[i].f, this.live[i].r); break; }
      }
    }
  };

  Board.prototype.flip = function () {
    this.flipped = !this.flipped;
    this.instant(function () {
      var self = this;
      this.live.forEach(function (it) { self.place(it.el, it.f, it.r); });
      this.placeCoords();
    });
  };
  Board.prototype.setFlipped = function (on) { if (on !== this.flipped) this.flip(); };

  Lux.Board = Board;
})();
