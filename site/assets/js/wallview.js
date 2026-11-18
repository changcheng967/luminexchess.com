/* luminexchess.com: the wall on the tests page. Every game the bench has played,
   one cell each, in boards of 64; point at a run to read it, select it to go to
   its row in the record (or to its page on the bench). The record below is the
   same information as text. */
(function () {
  "use strict";

  var Lux = window.Lux, C = Lux && Lux.cells;
  var fig = document.querySelector("[data-wall]");
  if (!C || !fig || !window.fetch) return;
  var canvas = fig.querySelector(".wall-canvas"), read = fig.querySelector("[data-wall-read]");
  if (!canvas || !canvas.getContext || !read) return;
  var ctx = canvas.getContext("2d");
  var start = read.textContent;
  var wall = null, pal = null, ink = {}, aspectFor = 0;
  var view = { w: 0, h: 0, s: 1, x: 0, y: 0 }, hover = null, pointer = { x: 0, y: 0, on: false }, raf = 0;
  var rows = {};                               // the tests the record lists, by number
  Lux.$$("[id^='t']", document).forEach(function (n) { if (/^t\d+$/.test(n.id)) rows[n.id.slice(1)] = true; });

  function colours() {
    pal = C.palette(fig);
    ink = { bg: pal.v("--bg-2", "#0e1014"), line: pal.v("--ink", "#f4f0e7"), lumen: pal.v("--lumen", "#ffc24b") };
  }
  function size() {
    var w = canvas.clientWidth, h = canvas.clientHeight, dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (!w || !h) return false;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    view.w = w; view.h = h;
    var aspect = Math.round((w / h) * 20) / 20;
    if (aspect !== aspectFor || !wall.bitmap) { wall.layout(aspect, pal); aspectFor = aspect; }
    view.s = Math.min(w / wall.W, h / wall.H);
    view.x = (w - wall.W * view.s) / 2; view.y = (h - wall.H * view.s) / 2;
    return true;
  }
  function draw() {
    raf = 0;
    var s = view.s;
    ctx.clearRect(0, 0, view.w, view.h);
    ctx.imageSmoothingEnabled = s < 1; ctx.imageSmoothingQuality = "medium";
    ctx.globalAlpha = hover ? 0.55 : 1;
    ctx.drawImage(wall.bitmap, view.x, view.y, wall.W * s, wall.H * s);
    ctx.globalAlpha = 1;
    if (wall.glow) {
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = hover ? 0.25 : 0.5;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(wall.glow, view.x, view.y, wall.W * s, wall.H * s);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
    }
    if (hover) {
      // the run under the pointer, at full strength, with a frame around each part of it
      wall.rects(hover.index).forEach(function (r) {
        ctx.imageSmoothingEnabled = s < 1;
        ctx.drawImage(wall.bitmap, r.x, r.y, r.w, r.h, view.x + r.x * s, view.y + r.y * s, r.w * s, r.h * s);
        ctx.strokeStyle = ink.lumen; ctx.lineWidth = 1.5;
        ctx.strokeRect(view.x + r.x * s - 3.5, view.y + r.y * s - 3.5, r.w * s + 7, r.h * s + 7);
      });
      if (pointer.on && Lux.finePointer) loupe();
    }
  }
  function loupe() {
    var r = 64, k = 9, x = pointer.x, y = pointer.y;
    var wx = (x - view.x) / view.s, wy = (y - view.y) / view.s;
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = ink.bg; ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(wall.bitmap, x - wx * k, y - wy * k, wall.W * k, wall.H * k);
    ctx.restore();
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.strokeStyle = ink.line; ctx.lineWidth = 1.5; ctx.stroke();
  }
  function ask() { if (!raf) raf = requestAnimationFrame(draw); }
  function pick(e) {
    var r = canvas.getBoundingClientRect();
    pointer.x = e.clientX - r.left; pointer.y = e.clientY - r.top; pointer.on = true;
    var hit = wall.at((pointer.x - view.x) / view.s, (pointer.y - view.y) / view.s);
    var was = hover ? hover.index : -1;
    hover = hit ? { index: hit.index, run: hit.run } : null;
    canvas.style.setProperty("cursor", hover && C.runHref(hover.run, rows[hover.run.id]) ? "pointer" : "default");
    if ((hover ? hover.index : -1) !== was) read.textContent = hover ? C.runLine(hover.run) : start;
    if (Lux.pointerAway) Lux.pointerAway(!!hover && Lux.finePointer);
    ask();
  }

  fetch(fig.getAttribute("data-src"), { credentials: "same-origin" })
    .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
    .then(function (data) {
      colours();
      wall = new C.Wall(data.runs);
      fig.classList.add("is-live");
      if (!size()) return;
      draw();
      canvas.addEventListener("pointermove", pick);
      canvas.addEventListener("pointerdown", pick);
      canvas.addEventListener("pointerleave", function () {
        pointer.on = false; hover = null; read.textContent = start;
        if (Lux.pointerAway) Lux.pointerAway(false);
        ask();
      });
      canvas.addEventListener("click", function () {
        var href = hover ? C.runHref(hover.run, rows[hover.run.id]) : null;
        if (href) window.location.href = href;
      });
      var t = 0;
      window.addEventListener("resize", function () { clearTimeout(t); t = setTimeout(function () { if (size()) draw(); }, 150); });
      new MutationObserver(function () { colours(); aspectFor = 0; if (size()) draw(); })
        .observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    })
    .catch(function () { fig.hidden = true; });
})();
