/**
 * Progressive enhancement only — every page works without this file.
 * Adds: service-worker registration (offline checklist), the connection
 * banner, local check-off persistence with the check-strike, and the print
 * button. No analytics, no tracking, no third-party calls, no PII: the
 * only stored value is a map of opaque plan line keys to booleans.
 */
(function enhance() {
  "use strict";

  /* Connection banner */
  var banner = document.getElementById("offline-banner");
  function reflectConnection() {
    if (banner) banner.hidden = navigator.onLine;
  }
  window.addEventListener("online", reflectConnection);
  window.addEventListener("offline", reflectConnection);
  reflectConnection();

  /* Service worker: keeps the checklist working in the aisle. */
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker
      .register("/sw.js")
      .then(function ready() {
        var note = document.getElementById("offline-ready");
        if (note) note.hidden = false;
      })
      .catch(function swFailed() {
        /* Enhancement only; the page still works. */
      });
  }

  /* Print button (hidden until JS exists, because it needs JS). */
  var printButton = document.querySelector("[data-print]");
  if (printButton) {
    printButton.hidden = false;
    printButton.addEventListener("click", function onPrint() {
      window.print();
    });
  }

  /* Checklist: persist check-offs locally; survives connection loss. */
  var list = document.querySelector("[data-checklist]");
  if (!list) return;
  var STORAGE_KEY = "plan-checklist-state-v1";
  var progress = document.getElementById("checklist-progress");

  function readState() {
    try {
      return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}") || {};
    } catch {
      return {};
    }
  }
  function writeState(state) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* Storage may be unavailable; checking still works for the session. */
    }
  }
  function updateProgress() {
    if (!progress) return;
    var total = Number(progress.getAttribute("data-total") || "0");
    var template = progress.getAttribute("data-template") || "";
    var done = list.querySelectorAll("input[data-check-item]:checked").length;
    if (template) {
      progress.textContent = template
        .replace("{done}", String(done))
        .replace("{total}", String(total));
    }
  }

  var state = readState();
  var boxes = list.querySelectorAll("input[data-check-item]");
  Array.prototype.forEach.call(boxes, function restore(box) {
    var row = box.closest("[data-line-key]");
    if (!row) return;
    var key = row.getAttribute("data-line-key");
    if (key && state[key]) {
      box.checked = true;
      row.classList.add("checked");
    }
    box.addEventListener("change", function onCheck() {
      if (box.checked) {
        row.classList.add("checked");
        if (key) state[key] = true;
      } else {
        row.classList.remove("checked");
        if (key) delete state[key];
      }
      writeState(state);
      updateProgress();
    });
  });
  updateProgress();
})();
