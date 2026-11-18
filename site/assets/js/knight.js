/* luminexchess.com: the logo, alive. The knight is drawn from its own light
   (assets/img/knight-glow.png, the logo taken off its background): every few
   pixels of it become one square, so it is made of the same cells as every
   other figure here. The first time it is seen, its squares fly in from the
   upper left, the way the logo's mane streams; the pointer scatters them and
   they settle back. Without motion it is the still logo. */
(function () {
  "use strict";

  var Lux = window.Lux;
  if (!Lux) return;
  var holders = Lux.$$("[data-knight-fx]");
  var STEP = 4;                  // pixels of the 320 px source per square

  holders.forEach(function (holder) {
    var canvas = document.createElement("canvas");
    canvas.className = "kn-canvas";
    canvas.setAttribute("aria-hidden", "true");
    holder.appendChild(canvas);
    if (!canvas.getContext) return;
    var ctx = canvas.getContext("2d");
    var img = new Image();
    img.decoding = "async";
    img.src = holder.getAttribute("data-knight-fx") || "/assets/img/knight-glow.png";

    var parts = [], W = 0, H = 0, k = 1, ox = 0, oy = 0, raf = 0, t0 = 0, intro = false, ready = false;
    var ptr = { x: -1e4, y: -1e4, on: false };

    function sample() {
      var s = document.createElement("canvas");
      s.width = img.naturalWidth; s.height = img.naturalHeight;
      var c = s.getContext("2d", { willReadFrequently: true });
      c.drawImage(img, 0, 0);
      var d = c.getImageData(0, 0, s.width, s.height).data, rnd = Lux.cells ? Lux.cells.rng(97) : Math.random;
      for (var y = 0; y + STEP <= s.height; y += STEP) {
        for (var x = 0; x + STEP <= s.width; x += STEP) {
          // the brightest pixel of the patch speaks for it
          var ba = 0, br = 0, bg = 0, bb = 0;
          for (var yy = 0; yy < STEP; yy++) for (var xx = 0; xx < STEP; xx++) {
            var o = ((y + yy) * s.width + x + xx) * 4;
            if (d[o + 3] > ba) { ba = d[o + 3]; br = d[o]; bg = d[o + 1]; bb = d[o + 2]; }
          }
          if (ba < 38) continue;
          // where it comes from: up and to the left, along the mane's streaks
          var dist = 140 + rnd() * 380, side = (rnd() - 0.5) * 120;
          parts.push({
            hx: x + STEP / 2, hy: y + STEP / 2, x: 0, y: 0, vx: 0, vy: 0,
            sx: x + STEP / 2 - dist * 0.48 + side * 0.88, sy: y + STEP / 2 - dist * 0.88 - side * 0.48,
            delay: rnd() * 0.55 + (1 - (y / s.height)) * 0.25,
            col: "rgb(" + br + "," + bg + "," + bb + ")", a: Math.min(1, ba / 255 * 1.15)
          });
        }
      }
      parts.forEach(function (p) { p.x = p.hx; p.y = p.hy; });
    }
    function size() {
      var w = holder.clientWidth, h = holder.clientHeight, dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (!w || !h) return false;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      W = w; H = h;
      var src = img.naturalWidth || 320;
      k = Math.min(w, h) / src;
      ox = (w - src * k) / 2; oy = (h - src * k) / 2;
      return true;
    }
    function draw() {
      ctx.clearRect(0, 0, W, H);
      var sq = STEP * k * 0.84, glow = STEP * k * 2.3;
      ctx.globalCompositeOperation = "lighter";
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i], x = ox + p.x * k, y = oy + p.y * k, a = p.a * (p.fade == null ? 1 : p.fade);
        if (a <= 0.01) continue;
        ctx.globalAlpha = a * 0.12;
        ctx.fillStyle = p.col;
        ctx.fillRect(x - glow / 2, y - glow / 2, glow, glow);
        ctx.globalAlpha = a;
        ctx.fillRect(x - sq / 2, y - sq / 2, sq, sq);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    }
    function still() {
      if (!size()) return;
      ctx.clearRect(0, 0, W, H);
      var src = img.naturalWidth || 320;
      ctx.drawImage(img, ox, oy, src * k, src * k);
    }
    function ease(t) { return 1 - Math.pow(1 - t, 3); }
    function frame(now) {
      raf = 0;
      var moving = false, i, p;
      if (intro) {
        var t = (now - t0) / 1000, all = true;
        for (i = 0; i < parts.length; i++) {
          p = parts[i];
          var u = Math.max(0, Math.min(1, (t - p.delay) / 1.1)), e = ease(u);
          p.x = p.sx + (p.hx - p.sx) * e; p.y = p.sy + (p.hy - p.sy) * e; p.fade = Math.min(1, u * 1.6);
          if (u < 1) all = false;
        }
        if (all) { intro = false; parts.forEach(function (q) { q.fade = null; }); }
        moving = true;
      } else {
        var R = 70 / k, R2 = R * R, px = (ptr.x - ox) / k, py = (ptr.y - oy) / k;
        for (i = 0; i < parts.length; i++) {
          p = parts[i];
          var dx = p.x - px, dy = p.y - py, d2 = dx * dx + dy * dy;
          if (ptr.on && d2 < R2) {
            var d = Math.sqrt(d2) || 1, f = (1 - d / R) * (1 - d / R) * 9;
            p.vx += dx / d * f; p.vy += dy / d * f;
          }
          p.vx += (p.hx - p.x) * 0.07; p.vy += (p.hy - p.y) * 0.07;
          p.vx *= 0.8; p.vy *= 0.8;
          p.x += p.vx; p.y += p.vy;
          if (Math.abs(p.vx) + Math.abs(p.vy) > 0.02 || Math.abs(p.hx - p.x) + Math.abs(p.hy - p.y) > 0.05) moving = true;
        }
      }
      draw();
      if (moving || ptr.on) raf = requestAnimationFrame(frame);
    }
    function ask() { if (!raf && ready) raf = requestAnimationFrame(frame); }

    img.onload = function () {
      holder.classList.add("is-live");
      if (!Lux.motion) { still(); window.addEventListener("resize", still); return; }
      sample();
      if (!size()) return;
      ready = true;
      draw();
      Lux.onVisible(holder, function () {
        intro = true; t0 = performance.now();
        parts.forEach(function (q) { q.x = q.sx; q.y = q.sy; q.fade = 0; });
        ask();
      }, 0.35);
      holder.addEventListener("pointermove", function (e) {
        var r = holder.getBoundingClientRect();
        ptr.x = e.clientX - r.left; ptr.y = e.clientY - r.top; ptr.on = true;
        ask();
      });
      holder.addEventListener("pointerdown", function (e) {
        var r = holder.getBoundingClientRect();
        ptr.x = e.clientX - r.left; ptr.y = e.clientY - r.top; ptr.on = true;
        ask();
      });
      holder.addEventListener("pointerleave", function () { ptr.on = false; ask(); });
      var t = 0;
      window.addEventListener("resize", function () { clearTimeout(t); t = setTimeout(function () { if (size()) draw(); }, 150); });
    };
  });
})();
