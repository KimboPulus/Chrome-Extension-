"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeSite } = require("../lib/domain");
const {
  parseBlockedSites,
  parseDailyLimits
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
