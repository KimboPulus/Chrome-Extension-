"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeSite } = require("../lib/domain");
const {
  minutesToSeconds,
  parseBlockedSites,
  parseDailyLimits,
  secondsToMinutes
} = require("../lib/settings");

test("accepts common separators between blocked sites", () => {
  const sites = parseBlockedSites(
    "youtube.com,\nwww.reddit.com; https://m.instagram.com/explore twitch.tv",
    normalizeSite
  );

  assert.deepEqual(sites, [
    "youtube.com",
    "reddit.com",
    "instagram.com",
    "twitch.tv"
  ]);
});

test("removes duplicate blocked sites after normalization", () => {
  const sites = parseBlockedSites(
    "youtube.com\nwww.youtube.com",
    normalizeSite
  );

  assert.deepEqual(sites, ["youtube.com"]);
});

test("builds normalized daily limits", () => {
  const limits = parseDailyLimits(
    [
      { domain: "www.youtube.com", minutes: "45" },
      { domain: "", minutes: "30" },
      { domain: "reddit.com", minutes: 20.4 }
    ],
    normalizeSite
  );

  assert.deepEqual(limits, {
    "youtube.com": 45,
    "reddit.com": 20
  });
});

test("rejects duplicate daily limits", () => {
  assert.throws(
    () =>
      parseDailyLimits(
        [
          { domain: "youtube.com", minutes: 30 },
          { domain: "www.youtube.com", minutes: 40 }
        ],
        normalizeSite
      ),
    /more than one daily limit/
  );
});

test("converts stored seconds to display minutes", () => {
  assert.equal(secondsToMinutes(60), 1);
  assert.equal(secondsToMinutes(75), 1.25);
  assert.equal(secondsToMinutes(900), 15);
  assert.equal(secondsToMinutes(1800), 30);
});

test("converts entered minutes back to stored seconds", () => {
  assert.equal(minutesToSeconds(0.25), 15);
  assert.equal(minutesToSeconds(1.25), 75);
  assert.equal(minutesToSeconds(15), 900);
  assert.equal(minutesToSeconds(1440), 86400);
});

test("rejects an idle threshold outside the supported range", () => {
  assert.throws(() => minutesToSeconds(0.1), /0.25 and 1440 minutes/);
  assert.throws(() => minutesToSeconds(1440.25), /0.25 and 1440 minutes/);
});
