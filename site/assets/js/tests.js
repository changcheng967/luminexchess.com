/* luminexchess.com: the test record. The rows are complete in the page; this
   adds the outcome filter, the entrance of each row, and opening a row named in
   the address (/tests/#t63). */
(function () {
  "use strict";

  var Lux = window.Lux;
  if (!Lux) return;
  var $ = Lux.$, $$ = Lux.$$, motion = Lux.motion;
  var rec = $("[data-record]");
  if (!rec) return;

  var rows = $$(".trow", rec), chips = $$("[data-filter]", rec), count = $("[data-record-count]", rec);
  var words = {
    pass: "the tests that passed",
    fail: "the tests that failed",
    merged: "the changes merged although their test did not pass",
    stop: "the tests that were stopped"
  };

  // rows rise in one after another; the interval and dot grow out from the zero line
  function enter(list) {
    list.forEach(function (row, i) {
      row.style.setProperty("--i", Math.min(i, 14));
      row.classList.add("is-in");
    });
  }

  function apply(filter, quiet) {
    var shown = [];
    rows.forEach(function (row) {
      var show = filter === "all" || row.getAttribute("data-status") === filter;
      row.hidden = !show;
      if (show) shown.push(row);
    });
    chips.forEach(function (c) { c.setAttribute("aria-pressed", c.getAttribute("data-filter") === filter ? "true" : "false"); });
    if (count) count.textContent = filter === "all" ? "" : "Showing " + shown.length + " of " + rows.length + ": " + words[filter] + ".";
    if (!motion || quiet) { shown.forEach(function (row) { row.classList.add("is-in"); }); return; }
    // play the entrance again for what is left
    var near = shown.filter(function (row) { return row.getBoundingClientRect().top < window.innerHeight; });
    shown.forEach(function (row) { row.classList.add("is-in"); });
    near.forEach(function (row) { row.classList.remove("is-in"); });
    void rec.offsetWidth;
    enter(near);
  }
  chips.forEach(function (c) {
    c.addEventListener("click", function () { apply(c.getAttribute("data-filter")); });
  });

  if (motion && "IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      var arriving = [];
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        io.unobserve(e.target);
        arriving.push(e.target);
      });
      enter(arriving);
    }, { threshold: 0.2, rootMargin: "0px 0px -4% 0px" });
    rows.forEach(function (row) { io.observe(row); });
  } else {
    rows.forEach(function (row) { row.classList.add("is-in"); });
  }

  function openTarget() {
    var id = (location.hash || "").slice(1);
    var row = id ? document.getElementById(id) : null;
    if (!row || !row.classList.contains("trow")) return;
    if (row.hidden) apply("all", true);
    row.classList.add("is-in", "is-target");
    row.scrollIntoView({ block: "center" });
    setTimeout(function () { row.classList.remove("is-target"); }, 3200);
  }
  window.addEventListener("hashchange", openTarget);
  openTarget();
})();
