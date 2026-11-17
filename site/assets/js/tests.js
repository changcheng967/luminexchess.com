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
    chips.forEach(function (c) { c.setAttribute("aria-pressed", c.getAttribute("data-filter") === filter ? "true" : "false"); });
    if (count) count.textContent = filter === "all" ? "" : "Showing " + shown.length + " of " + rows.length + ": " + words[filter] + ".";
  }
  chips.forEach(function (c) {
    c.addEventListener("click", function () { apply(c.getAttribute("data-filter")); });
  });

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
