/* luminexchess.com: the home page's scenes.
   - the opening: scrolling plays a real game on the board;
   - the ladder: Luminex climbs past one Stash release after another;
   - the strip of tests, the four steps, and the chronicle with its chart.
   Every scene has a still form, used without scripts or with reduced motion. */
(function () {
  "use strict";

  var Lux = window.Lux;
  if (!Lux) return;
  var $ = Lux.$, $$ = Lux.$$, el = Lux.el, clamp = Lux.clamp, motion = Lux.motion;
  var SVGNS = "http://www.w3.org/2000/svg";

  // addresses from the time the site was one page
  var moved = { "#games": "/games/", "#network": "/engine/#network", "#faq": "/download/#faq" };
  if (moved[location.hash]) { location.replace(moved[location.hash]); return; }
  window.addEventListener("hashchange", function () {
    if (moved[location.hash]) location.replace(moved[location.hash]);
  });

  function svgEl(tag, attrs, cls) {
    var e = document.createElementNS(SVGNS, tag);
    if (cls) e.setAttribute("class", cls);
    for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) e.setAttribute(k, attrs[k]);
    return e;
  }

  /* =====================================================================
     The opening: a game played by the scroll position
     ===================================================================== */
  (function opening() {
    var sec = $("[data-opening]");
    if (!sec || !window.fetch) return;
    var boardEl = $(".board", sec), hero = $("[data-hero]", sec), replay = $("[data-replay]", sec);
    var evalFill = $(".evalbar i", sec), consoleEl = $("[data-console]", sec), pinEl = $(".opening-pin", sec), footEl = $("[data-foot]", sec);
    var wide = window.matchMedia("(min-width: 900px)");
    function g(name) { return $('[data-g="' + name + '"]', sec); }

    var board = new Lux.Board(boardEl, { coords: true });

    // the pieces are set down in a wave, from the centre files outward
    if (motion && window.scrollY < 60) {
      board.live.forEach(function (it) {
        var pawn = it.p.charAt(1) === "P", black = it.p.charAt(0) === "b";
        it.el.style.setProperty("--i", Math.round(Math.abs(it.f - 3.5) * 2) + (pawn ? 9 : 0) + (black ? 4 : 0));
      });
      boardEl.classList.add("is-set");
      setTimeout(function () { boardEl.classList.add("is-live"); boardEl.classList.remove("is-set"); }, 2600);
    } else {
      boardEl.classList.add("is-live");
    }

    fetch(sec.getAttribute("data-src"), { credentials: "same-origin" })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
      .then(function (games) { if (games && games[0] && games[0].plies) start(games[0]); })
      .catch(function () { /* the board keeps its starting position */ });

    function start(game) {
      var lumWhite = game.white === "Luminex";

      /* ---- the positions, one per step: the starting array, the book moves, the game ---- */
      var P = [{ fen: Lux.START }];
      var book = (sec.getAttribute("data-book") || "").split(" ").filter(Boolean);
      var bookSan = (sec.getAttribute("data-book-san") || "").split(" ");
      var fen = Lux.START;
      book.forEach(function (uci, i) {
        fen = Lux.applyUci(fen, uci);
        P.push({ fen: fen, uci: uci, san: bookSan[i] || uci, book: true, white: i % 2 === 0, no: Math.floor(i / 2) + 1 });
      });
      if (fen !== game.startFen) P = [{ fen: game.startFen }];   // the book does not lead here: start after it
      var first = P.length;
      game.plies.forEach(function (p, k) {
        P.push({
          fen: p.fen, uci: p.uci, san: p.san, k: k,
          white: game.whiteFirst ? k % 2 === 0 : k % 2 === 1,
          no: game.startMove + Math.floor((k + (game.whiteFirst ? 0 : 1)) / 2),
          cp: p.cp, mate: p.mate, depth: p.depth, by: p.by
        });
      });
      var N = P.length - 1;
      var moments = {}, momentSteps = [];
      Object.keys(game.moments || {}).forEach(function (key) { moments[+key + first] = game.moments[key]; });
      momentSteps = Object.keys(moments).map(Number).sort(function (a, b) { return a - b; });
      // the latest score each engine reported, at every step
      var lastL = [], lastS = [], l = null, s0 = null;
      for (var i = 0; i <= N; i++) {
        if (P[i].by === "l") l = P[i]; else if (P[i].by === "s") s0 = P[i];
        lastL[i] = l; lastS[i] = s0;
      }

      function label(step) { var q = P[step]; return q.no + (q.white ? "." : "…") + q.san; }
      // an engine's score for its own side
      function ownSign(by) { return (by === "l") === lumWhite ? 1 : -1; }
      function own(p) {
        var sgn = ownSign(p.by);
        if (/#$/.test(p.san || "")) return { text: "#", meta: "checkmate", cp: 3000 };   // the mating move itself
        if (p.mate !== null && p.mate !== undefined) {
          var m = p.mate * sgn;
          if (m === 0) return { text: "#", meta: "checkmate", cp: 3000 };
          var n = Math.ceil(Math.abs(m) / 2);
          return { text: (m > 0 ? "+M" : "−M") + n, meta: m > 0 ? "mates in " + n : "mated in " + n, cp: m > 0 ? 3000 : -3000 };
        }
        var v = (p.cp * sgn) / 100;
        return { text: (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(2), meta: "depth " + p.depth, cp: p.cp * sgn };
      }
      // any score seen from Luminex's side, squashed to [-1, 1] for the graph
      function lumValue(p) {
        var sgn = lumWhite ? 1 : -1;
        if (p.mate !== null && p.mate !== undefined) {
          var m = p.mate * sgn;
          if (m === 0) m = p.by === "l" ? 1 : -1;
          return m > 0 ? 1 : -1;
        }
        return Math.tanh((p.cp * sgn) / 350);
      }

      /* ---- the panel ---- */
      g("title").textContent = game.title;
      g("story").textContent = game.story;
      g("result").textContent = game.result.replace("-", "–");
      var defaultText = g("moment").textContent;
      var momentBox = g("moment-box"), momentMove = g("moment-move"), momentText = g("moment");
      var momentP = momentText.parentNode, gapEl = g("gap");
      var lumScore = g("lum"), lumMeta = g("lum-meta"), oppScore = g("opp"), oppMeta = g("opp-meta");
      var moveEl = g("move"), evalEl = g("eval"), depthEl = g("depth"), drawEl = g("draw");

      // the graph of both scores
      (function graph() {
        var n = game.plies.length, lum = [], opp = [];
        game.plies.forEach(function (p, k) {
          if (p.cp === null && p.mate === null) return;
          var pt = [(n < 2 ? 0 : k / (n - 1)) * 1000, 100 - 92 * lumValue(p)];
          (p.by === "l" ? lum : opp).push(pt);
        });
        function line(pts) { return pts.map(function (q, j) { return (j ? "L" : "M") + q[0].toFixed(1) + " " + q[1].toFixed(1); }).join(""); }
        g("lum-line").setAttribute("d", line(lum));
        g("opp-line").setAttribute("d", line(opp));
        if (lum.length) g("lum-area").setAttribute("d", "M" + lum[0][0].toFixed(1) + " 100" + line(lum).replace(/^M/, "L") + "L" + lum[lum.length - 1][0].toFixed(1) + " 100Z");
      })();

      // one button per key moment
      var pips = g("pips"), pipButtons = [];
      momentSteps.forEach(function (step) {
        var li = el("li"), b = el("button");
        b.type = "button";
        b.setAttribute("aria-label", "Go to " + label(step) + ". " + moments[step].replace(/^[^:]*:\s*/, ""));
        b.appendChild(el("i"));
        b.addEventListener("click", function () { goTo(step); });
        li.appendChild(b); pips.appendChild(li);
        pipButtons.push(b);
      });

      var shown = -1, swapTimer = 0;
      function setMoment(move, text, past, quick) {
        momentBox.classList.toggle("is-past", !!past);
        if (momentText.textContent === text && momentMove.textContent === move) return;
        clearTimeout(swapTimer);
        if (quick || !motion) { momentMove.textContent = move; momentText.textContent = text; momentP.classList.remove("is-swap"); return; }
        momentP.classList.add("is-swap");
        swapTimer = setTimeout(function () {
          momentMove.textContent = move; momentText.textContent = text;
          momentP.classList.remove("is-swap");
        }, 190);
      }

      function render(step, animate, fast) {
        var q = P[step];
        shown = step;
        boardEl.classList.toggle("is-fast", !!fast);
        if (animate) board.set(q.fen, true); else board.instant(function () { board.set(q.fen, false); });
        board.mark(q.uci || null, !!q.san && /[+#]$/.test(q.san), q.white);

        var a = lastL[step], b = lastS[step];
        var A = a ? own(a) : null, B = b ? own(b) : null;
        lumScore.textContent = A ? A.text : "+0.00";
        lumMeta.textContent = A ? "its own score, " + A.meta : "its own score";
        oppScore.textContent = B ? B.text : "+0.00";
        oppMeta.textContent = B ? "its own score, " + B.meta : "its own score";
        var gap = "";
        // once either engine sees a decided game, the size of the gap means nothing
        if (a && b && a.mate === null && b.mate === null && Math.abs(A.cp) < 2000 && Math.abs(B.cp) < 2000) {
          var diff = Math.abs(A.cp + B.cp) / 100;        // the same position from opposite sides
          if (diff >= 1.5) gap = "The two engines disagree by " + diff.toFixed(1) + " pawns.";
        }
        if (gapEl.textContent !== gap) gapEl.textContent = gap;

        moveEl.textContent = step === 0 ? "Starting position" : (q.book ? "Book · " : "") + label(step);
        evalEl.textContent = "Luminex " + (A ? A.text : "+0.00");
        depthEl.textContent = a ? (a.mate !== null && a.mate !== undefined ? A.meta : "depth " + a.depth) : "depth –";

        var white = A ? (lumWhite ? A.cp : -A.cp) : 0;
        evalFill.style.setProperty("--e", (1 / (1 + Math.exp(-white / 260))).toFixed(3));
        drawEl.style.setProperty("--draw", q.k === undefined ? "0" : (game.plies.length < 2 ? 1 : q.k / (game.plies.length - 1)).toFixed(4));

        var at = -1;
        for (var j = 0; j < momentSteps.length; j++) if (momentSteps[j] <= step) at = momentSteps[j];
        if (at < 0) {
          if (step > 0 && step < first) setMoment("Book", "Opening: " + game.opening + ".", false, fast);
          else setMoment("", defaultText, false, fast);
        } else {
          setMoment(label(at), moments[at].replace(/^[^:]*:\s*/, ""), at !== step, fast);
        }
        pipButtons.forEach(function (btn, j) {
          btn.classList.toggle("is-done", step >= momentSteps[j]);
          btn.classList.toggle("is-now", step === momentSteps[j]);
        });
        sec.classList.toggle("is-mate", step === N);
      }

      /* ---- without motion: one still frame, the first moment Luminex saw coming ---- */
      if (!motion) {
        render(momentSteps.length ? momentSteps[0] : Math.min(N, first + 20), false, true);
        return;
      }

      /* ---- the scroll position chooses the step; the board catches up move by move ---- */
      var stops = [], L = 0, intro = 0, copyH = 0, target = 0, timer = 0, pending = false, lastK1 = -1;

      function layout() {
        var vh = window.innerHeight, big = wide.matches;
        intro = big ? Math.round(vh * 0.55) : 0;
        // on narrow screens the words scroll away first, then the board is held
        copyH = big ? 0 : Math.max(0, Math.round(consoleEl.getBoundingClientRect().top - pinEl.getBoundingClientRect().top));
        var per = big ? 15 : 12, bookPer = big ? 56 : 40, dwell = big ? 250 : 200;
        var pos = big ? 24 : 70;
        stops = [0];
        for (var st = 1; st <= N; st++) {
          stops[st] = pos;
          pos += (P[st].book ? bookPer : per) + (moments[st] ? dwell : 0);
        }
        L = intro + pos + Math.round(vh * (big ? 0.45 : 0.3));
        sec.style.setProperty("--len", L + "px");
        sec.style.setProperty("--copy-h", copyH + "px");
      }
      function stepAt(y) {
        var lo = 0, hi = N;
        while (lo < hi) { var mid = (lo + hi + 1) >> 1; if (stops[mid] <= y) lo = mid; else hi = mid - 1; }
        return lo;
      }
      function loop() {
        timer = 0;
        if (shown === target) { boardEl.classList.remove("is-fast"); return; }
        var gap = Math.abs(target - shown), dir = target > shown ? 1 : -1;
        // far behind (a jump down the page): cut to a dozen moves short, then play those
        if (gap > 30) render(target - dir * 12, false, true);
        else render(shown + dir, true, gap > 2);
        timer = setTimeout(loop, gap > 2 ? 48 : 110);
      }
      function update() {
        pending = false;
        var top = sec.getBoundingClientRect().top;
        var raw = -top - copyH, y = clamp(raw, 0, L);
        var k1 = intro ? clamp(y / intro) : 1;
        if (k1 !== lastK1) {
          lastK1 = k1;
          hero.style.setProperty("--k1", k1.toFixed(3));
          replay.style.setProperty("--k1", k1.toFixed(3));
          if (footEl) footEl.style.setProperty("--k1", k1.toFixed(3));
          sec.classList.toggle("is-game", k1 > 0.55);
        }
        sec.classList.toggle("is-under", -top > 30);
        sec.classList.toggle("is-playing", raw > intro * 0.6 && raw < L - 2);
        target = y > intro ? stepAt(y - intro) : 0;
        if (shown < 0) { render(target, false, true); return; }          // first frame: no catching up
        if (target !== shown && !timer) loop();
      }
      function ask() { if (!pending) { pending = true; requestAnimationFrame(update); } }
      function goTo(step) {
        var y = sec.getBoundingClientRect().top + window.scrollY + copyH + intro + stops[step] + 6;
        window.scrollTo({ top: y, behavior: "smooth" });
      }

      sec.classList.add("is-live");
      layout();
      update();
      window.addEventListener("scroll", ask, { passive: true });
      var resizeTimer = 0;
      window.addEventListener("resize", function () {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function () { layout(); ask(); Lux.refresh(); }, 120);
      });
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { layout(); ask(); });
    }
  })();

  /* =====================================================================
     The ladder: one Stash release after another
     ===================================================================== */
  (function ladder() {
    var root = $("[data-ladder]");
    if (!root || !motion) return;
    var list = $(".ladder", root), lumRow = $("[data-rung-lum]", root);
    var rungs = $$("[data-rung]", root).sort(function (a, b) { return a.getAttribute("data-rung") - b.getAttribute("data-rung"); });
    var odoEl = $("[data-ladder-odo]", root), stepEl = $("[data-ladder-step]", root);
    var marks = $$(".standing-rungs li", root);
    if (!list || !lumRow || rungs.length < 5 || !odoEl) return;
    var lumRating = $(".rung-rating", lumRow);

    var final = { num: odoEl.textContent.trim(), text: stepEl.textContent };
    var names = rungs.map(function (r) { return $(".rung-name", r).firstChild.textContent.trim(); });
    var ratings = rungs.map(function (r) { return $(".rung-rating", r).textContent.trim(); });
    var odo = Lux.odo(odoEl);
    odoEl.setAttribute("data-odo-manual", "");
    odoEl.classList.add("is-live");

    function measure() {
      var a = rungs[1].getBoundingClientRect(), b = rungs[0].getBoundingClientRect();
      var h = Math.abs(b.top - a.top);
      if (h > 0) list.style.setProperty("--h", h.toFixed(1) + "px");
    }
    var state = -1;
    function set(s) {
      if (s === state) return;
      state = s;
      list.setAttribute("data-s", Math.min(s, 4));
      rungs.forEach(function (r, i) { r.classList.toggle("is-met", i < s); });
      marks.forEach(function (m, i) { m.classList.toggle("is-on", i < s); });
      // the row carries the same reading as the big number while it climbs
      var reading = s === 0 ? "" : s < 5 ? ">" + ratings[s - 1] : final.num;
      if (lumRating) lumRating.textContent = reading || "…";
      if (s === 0) { odo.set(">" + ratings[0].replace(/\d/g, "0")); stepEl.textContent = "Five matches, one release at a time"; }
      else if (s < 5) { odo.set(">" + ratings[s - 1]); stepEl.textContent = "Beats " + names[s - 1] + ": above " + ratings[s - 1]; }
      else { odo.set(final.num); stepEl.textContent = final.text; }
    }
    measure();
    list.classList.add("is-armed");
    set(0);
    void list.offsetWidth;
    window.addEventListener("resize", measure);
    Lux.scene(list, {
      mode: function (r, vh) { return (vh * 0.84 - r.top) / (vh * 0.56); },
      onUpdate: function (p) { set(p <= 0.02 ? 0 : Math.min(5, 1 + Math.floor(p * 4.999))); }
    });
  })();

  /* =====================================================================
     Method: the four steps, and the strip of every test
     ===================================================================== */
  (function strip() {
    var fig = $("[data-strip]");
    if (!fig) return;
    var bars = $$(".sbar", fig);
    bars.forEach(function (b, i) {
      b.style.setProperty("--i", i);
      if (parseFloat(b.getAttribute("data-text").replace("−", "-")) < 0) b.classList.add("is-neg");
    });
    if (motion) {
      fig.classList.add("is-armed");
      Lux.onVisible(fig, function () { fig.classList.add("is-in"); }, 0.3);
    }

    // one tooltip, shared by every bar; the same details are in each bar's label
    var tip = el("div", "tip");
    tip.setAttribute("aria-hidden", "true");
    var tipValue = el("b"), tipTitle = el("span"), tipMeta = el("span");
    tip.appendChild(tipValue); tip.appendChild(tipTitle); tip.appendChild(tipMeta);
    fig.appendChild(tip);
    function show(bar) {
      var fr = fig.getBoundingClientRect(), br = $(".sbar-hit", bar).getBoundingClientRect();
      tipValue.textContent = bar.getAttribute("data-text") + " Elo";
      tipTitle.textContent = bar.getAttribute("data-title");
      tipMeta.textContent = "Test " + bar.getAttribute("data-test") + " · " + bar.getAttribute("data-games") + " games · " + bar.getAttribute("data-label");
      var x = clamp(br.left + br.width / 2 - fr.left, 150, fr.width - 150);
      tip.style.setProperty("--tx", x.toFixed(1) + "px");
      tip.style.setProperty("--ty", (br.top - fr.top - 8).toFixed(1) + "px");
      tip.classList.add("is-on");
    }
    function hide() { tip.classList.remove("is-on"); }
    bars.forEach(function (bar) {
      bar.addEventListener("pointerenter", function () { show(bar); });
      bar.addEventListener("pointerleave", hide);
      bar.addEventListener("focus", function () { show(bar); });
      bar.addEventListener("blur", hide);
    });
  })();

  /* =====================================================================
     Chronicle: the chart follows the timeline
     ===================================================================== */
  (function chronicle() {
    var fig = $("[data-climb]");
    if (!fig) return;
    var plot = $("[data-climb-plot]", fig), pts;
    try { pts = JSON.parse(fig.getAttribute("data-points") || "[]"); } catch (e) { return; }
    var goal = +fig.getAttribute("data-goal") || 0;
    if (!plot || pts.length < 2) return;

    // The chart is drawn at the size it is shown, so its labels are never scaled down.
    var W, H, Lm = 42, Rm = 22, T = 28, B = 52, PAD, draw, groups;
    var minV = Math.min.apply(null, pts.map(function (p) { return p.elo; }));
    var lo = Math.floor((minV - 200) / 100) * 100, hi = Math.ceil((Math.max(goal, pts[pts.length - 1].elo) + 100) / 100) * 100;
    function x(i) { return Lm + PAD + i * (W - Lm - Rm - 2 * PAD) / (pts.length - 1); }
    function y(v) { return T + (hi - v) / (hi - lo) * (H - T - B); }

    function build() {
      W = Math.max(300, Math.min(680, Math.round(plot.clientWidth) || 560));
      H = Math.round(W * 0.6);
      PAD = W < 420 ? 12 : 26;
      var box = "0 0 " + W + " " + H;
      plot.textContent = "";

      // three layers: the frame, the line (uncovered from the left), and the points
      var base = svgEl("svg", { viewBox: box, "aria-hidden": "true", focusable: "false" });
      var grid = svgEl("g", {}, "c-grid"), axis = svgEl("g", {}, "c-axis");
      for (var v = lo + 100; v <= hi; v += 200) {
        grid.appendChild(svgEl("line", { x1: Lm, x2: W - Rm, y1: y(v), y2: y(v) }));
        var t = svgEl("text", { x: Lm - 9, y: y(v) + 4, "text-anchor": "end" }); t.textContent = v; axis.appendChild(t);
      }
      base.appendChild(grid); base.appendChild(axis);
      if (goal) {
        var gg = svgEl("g", {}, "c-goal");
        gg.appendChild(svgEl("line", { x1: Lm, x2: W - Rm, y1: y(goal), y2: y(goal) }));
        var gt = svgEl("text", { x: W - Rm, y: y(goal) - 9, "text-anchor": "end" }); gt.textContent = "GOAL " + goal;
        gg.appendChild(gt); base.appendChild(gg);
      }
      plot.appendChild(base);

      draw = el("div", "draw");
      var data = svgEl("svg", { viewBox: box, "aria-hidden": "true", focusable: "false" });
      var d = pts.map(function (p, i) { return (i ? "L" : "M") + x(i).toFixed(1) + " " + y(p.elo).toFixed(1); }).join(" ");
      data.appendChild(svgEl("path", { d: d + " L" + x(pts.length - 1) + " " + (H - B) + " L" + x(0) + " " + (H - B) + " Z" }, "c-area"));
      data.appendChild(svgEl("path", { d: d }, "c-line"));
      draw.appendChild(data);
      plot.appendChild(draw);

      var top = svgEl("svg", { viewBox: box, role: "img", "aria-labelledby": "climb-title" });
      groups = pts.map(function (p, i) {
        var gEl = svgEl("g", {}, "c-pt");
        gEl.appendChild(svgEl("circle", { cx: x(i), cy: y(p.elo), r: 7 }, "c-halo"));
        gEl.appendChild(svgEl("circle", { cx: x(i), cy: y(p.elo), r: 6.5 }));
        var te = svgEl("text", { x: x(i), y: y(p.elo) - 15, "text-anchor": "middle" }, "c-elo"); te.textContent = "≈" + p.elo; gEl.appendChild(te);
        var tv = svgEl("text", { x: x(i), y: H - B + 22, "text-anchor": "middle" }, "c-ver"); tv.textContent = p.v; gEl.appendChild(tv);
        var td = svgEl("text", { x: x(i), y: H - B + 39, "text-anchor": "middle" }, "c-date"); td.textContent = W < 420 ? p.d.replace(" 2026", "") : p.d; gEl.appendChild(td);
        top.appendChild(gEl);
        return gEl;
      });
      plot.appendChild(top);
    }
    build();

    var numEl = $("[data-climb-odo]", fig), atEl = $("[data-climb-at]", fig), textEl = $("[data-climb-text]", fig);
    var last = pts.length - 1;
    function still() {
      draw.style.setProperty("--draw", "1");
      groups.forEach(function (gEl, i) { gEl.classList.add("is-on"); gEl.classList.toggle("is-now", i === last); });
    }
    var timeline = $("[data-timeline]"), sticky = window.matchMedia("(min-width: 941px)");
    var redraw = null, drawnAt = W, resizeTimer = 0;
    window.addEventListener("resize", function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        if (Math.abs((plot.clientWidth || drawnAt) - drawnAt) < 24) return;
        build();
        drawnAt = W;
        if (redraw) redraw(); else still();
      }, 180);
    });
    if (!motion || !timeline) { still(); return; }

    var odo = Lux.odo(numEl);
    numEl.setAttribute("data-odo-manual", "");
    numEl.classList.add("is-live");
    var items = $$(".tl", timeline), current = -2;
    // the chart shows the rating at the event in focus; -1 means no estimate yet
    function setPoint(a) {
      if (a === current) return;
      current = a;
      var i = Math.min(a, last);
      fig.classList.toggle("is-none", a < 0);
      draw.style.setProperty("--draw", a < 0 ? "0" : ((x(i) + (i === last ? Rm + PAD : 3)) / W).toFixed(4));
      groups.forEach(function (gEl, k) { gEl.classList.toggle("is-on", k <= i); gEl.classList.toggle("is-now", k === i); });
      if (a < 0) {
        odo.set("—");
        atEl.textContent = "The chart begins in August 2026";
        textEl.textContent = "";
      } else {
        odo.set("≈" + pts[i].elo);
        atEl.textContent = pts[i].v + " · " + pts[i].d;
        textEl.textContent = pts[i].t;
      }
      fig.classList.toggle("is-goal", a > last);
    }
    function focus() {
      if (!sticky.matches) {                    // the chart is not pinned on narrow screens: show it whole
        timeline.classList.remove("is-stepping");
        setPoint(last);
        return;
      }
      timeline.classList.add("is-stepping");
      var mid = window.innerHeight * 0.46, best = 0, dist = 1e9;
      items.forEach(function (li, k) {
        var r = li.getBoundingClientRect(), dd = Math.abs((r.top + r.bottom) / 2 - mid);
        if (dd < dist) { dist = dd; best = k; }
      });
      items.forEach(function (li, k) { li.classList.toggle("is-active", k === best); });
      setPoint(parseInt(items[best].getAttribute("data-pt"), 10));
    }
    Lux.scene(timeline, {
      mode: function (r, vh) { return (vh * 0.46 - r.top - 30) / (r.height - 60); },
      onUpdate: focus
    });
    redraw = function () { current = -2; focus(); };
    window.addEventListener("resize", focus);
    focus();
  })();
})();
