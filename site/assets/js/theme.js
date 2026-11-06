/* luminexchess.com: day and night editions. Loaded in <head>, before the stylesheet
   paints, so a stored choice never flashes the other edition. Without a stored
   choice the page follows the system setting through CSS alone. */
(function () {
  "use strict";

  var KEY = "lux-edition";
  var PAPER = { day: "#f3efe6", night: "#12110f" };
  var root = document.documentElement;
  var dark = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  var reduce = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;

  function stored() {
    try {
      var v = localStorage.getItem(KEY);
      return v === "day" || v === "night" ? v : null;
    } catch (e) { return null; }
  }
  function current() {
    return root.getAttribute("data-theme") || (dark && dark.matches ? "night" : "day");
  }
  // the browser chrome follows an edition the reader picked; otherwise the media queries decide
  function paintChrome(edition) {
    var metas = document.querySelectorAll('meta[name="theme-color"]');
    for (var i = 0; i < metas.length; i++) metas[i].setAttribute("content", PAPER[edition]);
  }
  function label() {
    var btn = document.querySelector("[data-edition]");
    if (btn) btn.setAttribute("aria-label", current() === "night" ? "Switch to the day edition" : "Switch to the night edition");
  }

  var choice = stored();
  if (choice) { root.setAttribute("data-theme", choice); paintChrome(choice); }

  function apply(edition) {
    root.setAttribute("data-theme", edition);
    try { localStorage.setItem(KEY, edition); } catch (e) { /* private mode: this visit only */ }
    paintChrome(edition);
    label();
  }

  // the new edition spreads from the toggle, like ink across the page
  function switchTo(edition, x, y) {
    // a hidden page gets no rendering steps, so a transition would never run its update
    if (!document.startViewTransition || document.visibilityState !== "visible" || (reduce && reduce.matches)) {
      apply(edition);
      return;
    }
    var t = document.startViewTransition(function () { apply(edition); });
    t.ready.then(function () {
      var r = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
      root.animate(
        { clipPath: ["circle(0px at " + x + "px " + y + "px)", "circle(" + Math.ceil(r) + "px at " + x + "px " + y + "px)"] },
        { duration: 620, easing: "cubic-bezier(0.4, 0, 0.2, 1)", pseudoElement: "::view-transition-new(root)" }
      );
    }).catch(function () { /* the switch itself already happened */ });
  }

  document.addEventListener("DOMContentLoaded", function () {
    var btn = document.querySelector("[data-edition]");
    if (!btn) return;
    label();
    btn.addEventListener("click", function () {
      var r = btn.getBoundingClientRect();
      switchTo(current() === "night" ? "day" : "night", r.left + r.width / 2, r.top + r.height / 2);
    });
  });
  if (dark && dark.addEventListener) dark.addEventListener("change", label);
})();
