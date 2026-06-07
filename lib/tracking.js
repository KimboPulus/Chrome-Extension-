"use strict";

(function exposeTrackingHelpers(root) {
  const PULSE_MODES = Object.freeze({
    FOREGROUND: "foreground",
    INTERACTION: "interaction",
    MEDIA: "media"
  });

  function isMediaElementPlaying(media) {
    return Boolean(
      media &&
      media.paused === false &&
      media.ended === false &&
      Number(media.readyState) >= 2 &&
      Number(media.playbackRate) > 0
    );
  }

  function selectPulseMode({ recentlyActive, mediaPlaying }) {
    if (mediaPlaying) {
      return PULSE_MODES.MEDIA;
    }

    return recentlyActive
      ? PULSE_MODES.INTERACTION
      : PULSE_MODES.FOREGROUND;
  }

  function resolvePulseMode(mode, tabAudible) {
    if (mode === PULSE_MODES.FOREGROUND) {
      return tabAudible ? PULSE_MODES.MEDIA : "";
    }

    return mode;
  }

  function canCountIdleState(mode, idleState) {
    if (idleState === "active") {
      return true;
    }

    return mode === PULSE_MODES.MEDIA && idleState === "idle";
  }

  function canCountWindowState(mode, windowFocused) {
    return windowFocused || mode === PULSE_MODES.MEDIA;
  }

  function normalizePulseMode(mode) {
    if (mode === PULSE_MODES.MEDIA || mode === PULSE_MODES.FOREGROUND) {
      return mode;
    }

    return PULSE_MODES.INTERACTION;
  }

  const api = {
    PULSE_MODES,
    canCountIdleState,
    canCountWindowState,
    isMediaElementPlaying,
    normalizePulseMode,
    resolvePulseMode,
    selectPulseMode
  };

  root.FocusTracking = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(globalThis);
