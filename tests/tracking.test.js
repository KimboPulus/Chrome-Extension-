"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  PULSE_MODES,
  canCountIdleState,
  canCountWindowState,
  isMediaElementPlaying,
  normalizePulseMode,
  resolvePulseMode,
  selectPulseMode
} = require("../lib/tracking");

test("detects a playing media element", () => {
  assert.equal(
    isMediaElementPlaying({
      paused: false,
      ended: false,
      readyState: 4,
      playbackRate: 1
    }),
    true
  );
});

test("does not count paused or stalled media", () => {
  assert.equal(
    isMediaElementPlaying({
      paused: true,
      ended: false,
      readyState: 4,
      playbackRate: 1
    }),
    false
  );
  assert.equal(
    isMediaElementPlaying({
      paused: false,
      ended: false,
      readyState: 1,
      playbackRate: 1
    }),
    false
  );
});

test("media playback takes priority over recent interaction", () => {
  assert.equal(
    selectPulseMode({ recentlyActive: true, mediaPlaying: true }),
    PULSE_MODES.MEDIA
  );
  assert.equal(
    selectPulseMode({ recentlyActive: true, mediaPlaying: false }),
    PULSE_MODES.INTERACTION
  );
  assert.equal(
    selectPulseMode({ recentlyActive: false, mediaPlaying: false }),
    PULSE_MODES.FOREGROUND
  );
});

test("uses audible tab state as a media fallback", () => {
  assert.equal(
    resolvePulseMode(PULSE_MODES.FOREGROUND, true),
    PULSE_MODES.MEDIA
  );
  assert.equal(resolvePulseMode(PULSE_MODES.FOREGROUND, false), "");
  assert.equal(
    resolvePulseMode(PULSE_MODES.INTERACTION, false),
    PULSE_MODES.INTERACTION
  );
});

test("normalizes supported pulse modes", () => {
  assert.equal(
    normalizePulseMode(PULSE_MODES.FOREGROUND),
    PULSE_MODES.FOREGROUND
  );
  assert.equal(normalizePulseMode(PULSE_MODES.MEDIA), PULSE_MODES.MEDIA);
  assert.equal(normalizePulseMode("unknown"), PULSE_MODES.INTERACTION);
});

test("playing media counts while idle but never while locked", () => {
  assert.equal(canCountIdleState(PULSE_MODES.MEDIA, "idle"), true);
  assert.equal(canCountIdleState(PULSE_MODES.INTERACTION, "idle"), false);
  assert.equal(canCountIdleState(PULSE_MODES.MEDIA, "locked"), false);
  assert.equal(canCountIdleState(PULSE_MODES.INTERACTION, "active"), true);
});

test("playing media counts outside the browser window", () => {
  assert.equal(canCountWindowState(PULSE_MODES.MEDIA, false), true);
  assert.equal(canCountWindowState(PULSE_MODES.INTERACTION, false), false);
  assert.equal(canCountWindowState(PULSE_MODES.FOREGROUND, false), false);
  assert.equal(canCountWindowState(PULSE_MODES.INTERACTION, true), true);
});
