/* luminexchess.com: runs in <head>, before the first paint.
   - marks the document as scripted ("js") and, unless the visitor asked for
     reduced motion, as animated ("motion"); the stylesheet keys every hidden
     starting state on those classes, so the page is complete without them;
   - applies a stored light or dark choice so it never flashes the other one.
   Without a stored choice the page follows the system setting through CSS. */
(function () {
  "use strict";

  var KEY = "lux-edition";                 // "day" | "night"
  var root = document.documentElement;
  var mm = window.matchMedia ? window.matchMedia.bind(window) : null;
  var dark = mm ? mm("(prefers-color-scheme: dark)") : null;
  var reduce = mm ? mm("(prefers-reduced-motion: reduce)") : null;

  // the footer's "Reduce motion" switch stores "off"
  var motionOff = false;
  try { motionOff = localStorage.getItem("lux-motion") === "off"; } catch (e) { /* no storage */ }

  root.classList.remove("no-js");
  root.classList.add("js");
  if ((!reduce || !reduce.matches) && !motionOff) root.classList.add("motion");

  function stored() {
    try {
      var v = localStorage.getItem(KEY);
      return v === "day" || v === "night" ? v : null;
    } catch (e) { return null; }
  }
  function current() {
    return root.getAttribute("data-theme") || (dark && dark.matches ? "night" : "day");
  }
  function label() {
    var btn = document.querySelector("[data-edition]");
    if (btn) btn.setAttribute("aria-label", current() === "night" ? "Switch to the light theme" : "Switch to the dark theme");
  }

  var choice = stored();
  if (choice) root.setAttribute("data-theme", choice);

  function apply(edition) {
    root.setAttribute("data-theme", edition);
    try { localStorage.setItem(KEY, edition); } catch (e) { /* private mode: this visit only */ }
    label();
  }

  // the new theme spreads from the switch, like a lamp coming on
  function switchTo(edition, x, y) {
    // a hidden page gets no rendering steps, so a transition would never finish
    if (!document.startViewTransition || document.visibilityState !== "visible" || (reduce && reduce.matches)) {
      apply(edition);
      return;
    }
    root.classList.add("is-theming");
    var t = document.startViewTransition(function () { apply(edition); });
    t.ready.then(function () {
      var r = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
      root.animate(
        { clipPath: ["circle(0px at " + x + "px " + y + "px)", "circle(" + Math.ceil(r) + "px at " + x + "px " + y + "px)"] },
        { duration: 700, easing: "cubic-bezier(0.65, 0, 0.35, 1)", pseudoElement: "::view-transition-new(root)" }
      );
    }).catch(function () { /* the switch itself already happened */ });
    var done = function () { root.classList.remove("is-theming"); };
    t.finished.then(done, done);
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
