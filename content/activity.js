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

function hasPlayingMedia() {
  const mediaElementPlaying = [...document.querySelectorAll("video, audio")].some(
    FocusTracking.isMediaElementPlaying
  );
  const mediaSessionPlaying =
    navigator.mediaSession?.playbackState === "playing";

  return mediaElementPlaying || mediaSessionPlaying;
}

function sendActivityPulse() {
  const recentlyActive = Date.now() - lastActivityAt <= RECENT_ACTIVITY_MS;
  const mode = FocusTracking.selectPulseMode({
    recentlyActive,
    mediaPlaying: hasPlayingMedia()
  });

  if (document.visibilityState !== "visible") {
    return;
  }

  chrome.runtime.sendMessage({ type: "ACTIVITY_PULSE", mode }).catch(() => {
    // The extension may be reloading while this page is still open.
  });
}

document.addEventListener("playing", sendActivityPulse, true);
setInterval(sendActivityPulse, PULSE_INTERVAL_MS);
