import { isMediaElementPlaying, selectPulseMode } from "../../domain/tracking";

const PULSE_INTERVAL_MS = 5000;
const RECENT_ACTIVITY_MS = 15_000;
let lastInteractionAt = Date.now();

function noteInteraction(): void {
  lastInteractionAt = Date.now();
}

function hasPlayingMedia(): boolean {
  return [...document.querySelectorAll<HTMLMediaElement>("video, audio")].some(
    (media) => isMediaElementPlaying(media),
  );
}

function pulse(): void {
  if (document.visibilityState !== "visible") {
    return;
  }

  const mode = selectPulseMode({
    mediaPlaying: hasPlayingMedia(),
    recentlyActive: Date.now() - lastInteractionAt <= RECENT_ACTIVITY_MS,
  });

  void chrome.runtime
    .sendMessage({ mode, type: "ACTIVITY_PULSE" })
    .catch(() => {
      // Extension reloads invalidate existing content-script contexts.
    });
}

for (const eventName of [
  "keydown",
  "mousedown",
  "mousemove",
  "pointerdown",
  "scroll",
  "touchstart",
] as const) {
  window.addEventListener(eventName, noteInteraction, {
    capture: true,
    passive: true,
  });
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    noteInteraction();
    pulse();
  }
});

window.setInterval(pulse, PULSE_INTERVAL_MS);
pulse();
