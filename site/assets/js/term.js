/* luminexchess.com: the download page's terminal. A real session with the engine, replayed at its own
   pace from /assets/data/think.json: what was sent, then every line that came back, as the engine wrote
   it and when. The search's lines arrive at their own times (nodes / nps), the best move at the moment
   the search ended. Nothing here is made up: the commands are the ones the recording sent, in order. */
(function () {
  "use strict";

  var Lux = window.Lux;
  var fig = document.querySelector("[data-term]");
  if (!Lux || !fig || !window.fetch) return;
  var el = Lux.el, motion = Lux.motion;
  var body = fig.querySelector("[data-term-body]"), tabsEl = fig.querySelector("[data-term-tabs]");
  var clock = fig.querySelector("[data-term-clock]"), cap = fig.querySelector("[data-term-cap]");
  if (!body || !tabsEl) return;

  var data = null, cur = 0, timer = 0, raf = 0, on = false, script = [], at = 0, t0 = 0, goAt = 0, endAt = 0, done = false;

  // a line as the engine printed it, in spans: keys quiet, values bright, the score lit by its sign
  function infoSpans(l) {
    var row = el("div", "tl tl-info");
    function k(t) { row.appendChild(el("span", "tk", t)); }
    function v(t, cls) { row.appendChild(el("span", "tv" + (cls ? " " + cls : ""), t)); }
    k("info depth "); v(String(l.depth), "tv-d");
    if (l.seldepth != null) { k(" seldepth "); v(String(l.seldepth)); }
    k(" score ");
    if (l.mate != null) v("mate " + l.mate, l.mate > 0 ? "tv-up" : "tv-down");
    else v("cp " + l.cp, l.cp > 0 ? "tv-up" : l.cp < 0 ? "tv-down" : "");
    k(" nodes "); v(String(l.nodes));
    k(" nps "); v(String(l.nps));
    k(" pv ");
    v(l.pv[0], "tv-best");
    if (l.pv.length > 1) row.appendChild(el("span", "tk tv-pv", " " + l.pv.slice(1).join(" ")));
    return row;
  }
  function plain(text, cls) { return el("div", "tl " + cls, text); }

  function build(s) {
    var ev = [], t = 0;
    function cmd(text, gap) { var dur = Math.min(800, 60 + text.length * 4); t += gap; ev.push({ t: t, cmd: text, dur: dur }); t += dur + 140; }
    function out(text, gap, cls) { t += gap; ev.push({ t: t, node: function () { return plain(text, cls || "tl-out"); } }); }
    cmd("ucinewgame", 200);
    cmd("isready", 220);
    out("readyok", 120);
    cmd(s.position, 360);
    cmd("go movetime " + s.movetime, 260);
    goAt = t;
    if (s.note) out(s.note, 30, "tl-note");
    s.lines.forEach(function (l) { ev.push({ t: goAt + l.time, node: function () { return infoSpans(l); }, info: l }); });
    endAt = goAt + s.end;
    ev.push({ t: endAt, node: function () { return plain("bestmove " + s.bestmove + (s.ponder ? " ponder " + s.ponder : ""), "tl-best"); }, end: true });
    ev.sort(function (a, b) { return a.t - b.t; });
    return ev;
  }

  var MAX = 60;
  function push(node) {
    body.appendChild(node);
    while (body.children.length > MAX) body.removeChild(body.firstChild);
  }
  function typeCmd(e, now) {
    // a command is typed out quickly, then sent
    var row = e.row;
    if (!row) {
      row = e.row = el("div", "tl tl-cmd is-typing");
      row.appendChild(el("span", "tp", "› "));
      e.txt = el("span", "", "");
      row.appendChild(e.txt);
      push(row);
    }
    var n = Math.min(e.cmd.length, Math.ceil((now - e.t) / e.dur * e.cmd.length));
    e.txt.textContent = e.cmd.slice(0, n);
    if (n >= e.cmd.length) { row.classList.remove("is-typing"); return true; }
    return false;
  }
  function setClock(ms) {
    if (!clock) return;
    clock.textContent = ms < 0 ? "" : (ms / 1000).toFixed(2) + " s";
  }

  function frame(now) {
    raf = 0;
    if (!on) return;
    var t = now - t0;
    while (at < script.length && script[at].t <= t) {
      var e = script[at];
      if (e.cmd != null) { if (!typeCmd(e, t)) break; }
      else push(e.node());
      at++;
    }
    setClock(t >= goAt ? Math.min(t, endAt) - goAt : -1);
    fig.classList.toggle("is-searching", t >= goAt && t < endAt);
    if (at >= script.length && !done) {
      done = true;
      timer = setTimeout(function () { choose((cur + 1) % data.searches.length); }, 4200);
    }
    if (!done) raf = requestAnimationFrame(frame);
  }

  function still(s) {
    // without motion: the whole session at once
    body.textContent = "";
    build(s).forEach(function (e) {
      if (e.cmd != null) { var r = el("div", "tl tl-cmd"); r.appendChild(el("span", "tp", "› ")); r.appendChild(el("span", "", e.cmd)); push(r); }
      else push(e.node());
    });
    setClock(s.end);
  }

  var tabs = [];
  function choose(i) {
    cur = i;
    clearTimeout(timer);
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    tabs.forEach(function (b, k) { b.setAttribute("aria-pressed", k === i ? "true" : "false"); });
    var s = data.searches[i];
    if (!motion) { still(s); return; }
    body.textContent = "";
    script = build(s); at = 0; done = false;
    t0 = performance.now();
    if (on) raf = requestAnimationFrame(frame);
  }

  fetch("/assets/data/think.json", { credentials: "same-origin" })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (d) {
      if (!d || !d.searches || !d.searches.length) return;
      data = d;
      fig.hidden = false;
      if (cap && d.about) cap.textContent = "A real session, replayed at the engine's own pace: " + d.about + ".";
      tabs = d.searches.map(function (s, i) {
        var b = el("button", "term-tab", s.tab);
        b.type = "button";
        b.setAttribute("aria-pressed", "false");
        b.addEventListener("click", function () { if (!motion && i === cur) return; choose(i); });
        tabsEl.appendChild(b);
        return b;
      });
      if (!motion) { choose(0); return; }
      Lux.whileVisible(fig, function (v) {
        var was = on;
        on = v;
        if (v && !was) {
          if (!data.started) { data.started = true; choose(0); }
          else if (!done && !raf) { t0 = performance.now() - (script[Math.max(0, at - 1)] || { t: 0 }).t; raf = requestAnimationFrame(frame); }
        }
        if (!v && raf) { cancelAnimationFrame(raf); raf = 0; }
      }, 0.25);
    })
    .catch(function () { fig.hidden = true; });
})();
