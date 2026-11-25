/* luminexchess.com: the test record. The rows are complete in the page; this
   adds the outcome filter and opening a row named in the address (/tests/#t63). */
(function () {
  "use strict";

  var Lux = window.Lux;
  if (!Lux) return;
  var $ = Lux.$, $$ = Lux.$$;
  var rec = $("[data-record]");
  if (!rec) return;

  var rows = $$(".trow", rec), chips = $$("[data-filter]", rec), count = $("[data-record-count]", rec);
  var words = {
    pass: "the tests that passed",
    fail: "the tests that failed",
    merged: "the changes merged although their test did not pass",
    stop: "the tests that were stopped"
  };

  function apply(filter) {
    var shown = [];
    rows.forEach(function (row) {
      var show = filter === "all" || row.getAttribute("data-status") === filter;
      row.hidden = !show;
      if (show) shown.push(row);
    });
    if (river) river.filter();
    chips.forEach(function (c) { c.setAttribute("aria-pressed", c.getAttribute("data-filter") === filter ? "true" : "false"); });
    if (count) count.textContent = filter === "all" ? "" : "Showing " + shown.length + " of " + rows.length + ": " + words[filter] + ".";
  }
  chips.forEach(function (c) {
    c.addEventListener("click", function () { apply(c.getAttribute("data-filter")); });
  });

  /* ---------- the river: every test as a bar, oldest on the left ----------
     Built from the rows themselves. It stays at the top while the record scrolls under it; the bar of the
     row being read is lit, a bar pointed at says which test it is, and a bar pressed takes you to its row. */
  var river = (function () {
    if (!rows.length || !window.SVGElement) return null;
    var NS = "http://www.w3.org/2000/svg";
    function svg(tag, attrs, cls) {
      var e = document.createElementNS(NS, tag);
      if (cls) e.setAttribute("class", cls);
      for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) e.setAttribute(k, attrs[k]);
      return e;
    }
    var tests = rows.map(function (row) {
      var v = (($(".trow-value", row) || {}).textContent || "").trim(), m = /([+−-]?\d+(?:\.\d+)?)/.exec(v);
      var meta = (($(".trow-meta", row) || {}).textContent || "").trim();
      return { row: row, id: row.id, status: row.getAttribute("data-status"), e: m ? parseFloat(m[1].replace("−", "-")) : 0,
               text: v, title: (($(".trow-title", row) || {}).textContent || "").trim(), n: (/Test (\d+)/.exec(meta) || [])[1] || "" };
    }).reverse();
    var box = Lux.el("div", "river"), plot = Lux.el("div", "river-plot"), read = Lux.el("p", "river-read");
    box.setAttribute("aria-hidden", "true");
    var readN = Lux.el("span", "river-n"), readT = Lux.el("span", "river-t"), readV = Lux.el("span", "river-v num");
    read.appendChild(readN); read.appendChild(readV); read.appendChild(readT);
    box.appendChild(plot); box.appendChild(read);
    var bar = $(".record-bar", rec);
    bar.parentNode.insertBefore(box, bar.nextSibling);
    var LO = -40, HI = 120, H = 56, bars = [], hot = -1, hover = -1, W = 0;
    function draw() {
      var w = Math.floor(plot.getBoundingClientRect().width);
      if (!w || w === W) return;
      W = w;
      plot.textContent = "";
      bars = [];
      var s = svg("svg", { viewBox: "0 0 " + W + " " + H, width: W, height: H, focusable: "false" }, "river-svg");
      var step = W / tests.length, bw = Math.max(2, Math.min(9, step - 2)), y0 = H * HI / (HI - LO);
      s.appendChild(svg("line", { x1: 0, x2: W, y1: y0, y2: y0 }, "river-zero"));
      tests.forEach(function (t, i) {
        var e = Math.max(LO, Math.min(HI, t.e)), y = H * (HI - e) / (HI - LO), x = i * step + (step - bw) / 2;
        var g = svg("g", {}, "rb rb-" + t.status);
        g.style.setProperty("--i", i);
        g.appendChild(svg("rect", { x: i * step, y: 0, width: step, height: H }, "rb-hit"));
        g.appendChild(svg("rect", { x: x, width: bw, y: Math.min(y, y0), height: Math.max(1.5, Math.abs(y0 - y)), rx: Math.min(2, bw / 2) }, "rb-fill"));
        s.appendChild(g);
        bars.push(g);
      });
      plot.appendChild(s);
      filter();
      light();
      rec.style.setProperty("--river-h", box.offsetHeight + "px");   // the column heads stick just below it
    }
    function say(i) {
      var t = tests[i];
      if (!t) return;
      readN.textContent = "Test " + t.n;
      readV.textContent = t.text;
      readT.textContent = t.title;
    }
    function light() {
      bars.forEach(function (b, k) { b.classList.toggle("is-hot", k === hot); b.classList.toggle("is-hover", k === hover); });
      say(hover >= 0 ? hover : hot);
    }
    function filter() { bars.forEach(function (b, k) { b.classList.toggle("is-off", tests[k].row.hidden); }); }
    function where() {
      var mid = window.innerHeight * 0.45, best = -1, dist = 1e9;
      tests.forEach(function (t, k) {
        if (t.row.hidden) return;
        var r = t.row.getBoundingClientRect(), d = Math.abs((r.top + r.bottom) / 2 - mid);
        if (d < dist) { dist = d; best = k; }
      });
      if (best !== hot) { hot = best; light(); }
    }
    function at(e) {
      var r = plot.getBoundingClientRect();
      return Math.max(0, Math.min(tests.length - 1, Math.floor((e.clientX - r.left) / (r.width / tests.length))));
    }
    plot.addEventListener("pointermove", function (e) { var k = at(e); if (k !== hover) { hover = k; light(); } });
    plot.addEventListener("pointerleave", function () { hover = -1; light(); });
    plot.addEventListener("click", function (e) {
      var t = tests[at(e)];
      if (!t) return;
      if (t.row.hidden) apply("all");
      t.row.classList.add("is-target");
      t.row.scrollIntoView({ behavior: Lux.motion ? "smooth" : "auto", block: "center" });
      setTimeout(function () { t.row.classList.remove("is-target"); }, 2400);
    });
    var pend = false;
    window.addEventListener("scroll", function () { if (!pend) { pend = true; requestAnimationFrame(function () { pend = false; where(); }); } }, { passive: true });
    window.addEventListener("resize", function () { draw(); where(); });
    draw();
    where();
    if (Lux.motion) Lux.onVisible(box, function () { box.classList.add("is-in"); }, 0.5);
    else box.classList.add("is-in");
    return { filter: filter };
  })();

  function openTarget() {
    var id = (location.hash || "").slice(1);
    var row = id ? document.getElementById(id) : null;
    if (!row || !row.classList.contains("trow")) return;
    if (row.hidden) apply("all");
    row.classList.add("is-target");
    Lux.land(row);   // where the browser puts an anchor; on arrival it is kept there while the page settles
    setTimeout(function () { row.classList.remove("is-target"); }, 3200);
  }
  window.addEventListener("hashchange", openTarget);
  openTarget();
})();
