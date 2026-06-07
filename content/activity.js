"use strict";

const PULSE_INTERVAL_MS = 5000;
const RECENT_ACTIVITY_MS = 15000;

let lastActivityAt = Date.now();

function rememberActivity() {
  lastActivityAt = Date.now();
}

const activityEvents = [
  "keydown",
  "pointerdown",
  "pointermove",
  "scroll",
  "touchstart"
];

for (const eventName of activityEvents) {
  window.addEventListener(eventName, rememberActivity, {
    capture: true,
    passive: true
  });
}

function sendActivityPulse() {
  const recentlyActive = Date.now() - lastActivityAt <= RECENT_ACTIVITY_MS;

  if (document.visibilityState !== "visible" || !recentlyActive) {
    return;
  }

  chrome.runtime.sendMessage({ type: "ACTIVITY_PULSE" }).catch(() => {
    // The extension may be reloading while this page is still open.
  });
}

setInterval(sendActivityPulse, PULSE_INTERVAL_MS);
