/* luminexchess.com: the engine page.
   - the search, one idea at a time: the tree stays in place while the six
     steps scroll past, and it shows what has been explained so far;
   - the network: one detail panel for the selected layer;
   - the speed bars grow when they come on screen.
   Without scripts the tree is complete and every text is in the page. */
(function () {
  "use strict";

  var Lux = window.Lux;
  if (!Lux) return;
  var $ = Lux.$, $$ = Lux.$$, motion = Lux.motion;

  (function scrolly() {
    var root = $("[data-scrolly]");
    if (!root || !motion) return;
    var fig = $("[data-fig]", root), steps = $$(".step", root), dots = $$(".step-dots a", root);
    var current = 0;
    function set(n) {
      if (n === current) return;
      current = n;
      for (var i = 1; i <= steps.length; i++) {      // s1..sN: ideas shown so far; now-N: the one in focus
        fig.classList.toggle("s" + i, i <= n);
        fig.classList.toggle("now-" + i, i === n);
      }
      steps.forEach(function (li, k) { li.classList.toggle("is-active", k + 1 === n); });
      dots.forEach(function (a, k) {
        if (k + 1 === n) a.setAttribute("aria-current", "step"); else a.removeAttribute("aria-current");
      });
    }
    function focus() {
      var mid = window.innerHeight * 0.52, best = 1, dist = 1e9;
      steps.forEach(function (li, k) {
        var r = li.getBoundingClientRect(), d = Math.abs((r.top + r.bottom) / 2 - mid);
        if (d < dist) { dist = d; best = k + 1; }
      });
      set(best);
    }
    root.classList.add("is-live");
    Lux.scene(root, { mode: "view", onUpdate: focus });
    window.addEventListener("resize", focus);
    focus();
  })();

  (function network() {
    var list = $("[data-net]"), panel = $("#net-detail");
    if (!list || !panel) return;
    var layers = $$(".net-layer", list);
    function select(li, quiet) {
      layers.forEach(function (l) { $(".net-btn", l).setAttribute("aria-pressed", l === li ? "true" : "false"); });
      var strong = document.createElement("strong");
      strong.textContent = $(".net-name", li).textContent + " (" + $(".net-size", li).textContent + "). ";
      panel.textContent = "";
      panel.appendChild(strong);
      panel.appendChild(document.createTextNode($(".net-text", li).textContent));
      if (motion && !quiet) {
        panel.classList.remove("is-swap");
        void panel.offsetWidth;
        panel.classList.add("is-swap");
      }
    }
    layers.forEach(function (li) {
      $(".net-btn", li).addEventListener("click", function () { select(li); });
    });
    list.classList.add("is-live");
    select(layers[1], true);
  })();

  (function speed() {
    var fig = $("[data-speed]");
    if (!fig || !motion) return;
    $$(".bar", fig).forEach(function (b, i) { b.style.setProperty("--i", i); });
    fig.classList.add("is-armed");
    Lux.onVisible(fig, function () { fig.classList.add("is-in"); }, 0.35);
  })();
})();
