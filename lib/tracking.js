"use strict";

(function exposeTrackingHelpers(root) {
  const PULSE_MODES = Object.freeze({
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

    return recentlyActive ? PULSE_MODES.INTERACTION : "";
  }

  function canCountIdleState(mode, idleState) {
    if (idleState === "active") {
      return true;
    }

    return mode === PULSE_MODES.MEDIA && idleState === "idle";
  }

  function normalizePulseMode(mode) {
    return mode === PULSE_MODES.MEDIA
      ? PULSE_MODES.MEDIA
      : PULSE_MODES.INTERACTION;
  }

  const api = {
    PULSE_MODES,
    canCountIdleState,
    isMediaElementPlaying,
    normalizePulseMode,
    selectPulseMode
  };

  root.FocusTracking = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(globalThis);
