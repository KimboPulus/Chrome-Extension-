"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const storedValues = {};

global.chrome = {
  storage: {
    local: {
      async get(key) {
        if (typeof key === "string") {
          return { [key]: structuredClone(storedValues[key]) };
        }

        return structuredClone(storedValues);
      },
      async set(values) {
        Object.assign(storedValues, structuredClone(values));
      }
    }
  }
};

const storage = require("../lib/storage");

test.beforeEach(() => {
  for (const key of Object.keys(storedValues)) {
    delete storedValues[key];
  }
});

test("sanitizes settings before saving", async () => {
  const saved = await storage.saveSettings({
    blockedSites: ["reddit.com", "reddit.com", ""],
    dailyLimits: {
      "youtube.com": 35.4,
      "invalid.example": -2
    },
    idleThresholdSeconds: 4,
    warningPercent: 120
  });

  assert.deepEqual(saved.blockedSites, ["reddit.com"]);
  assert.deepEqual(saved.dailyLimits, { "youtube.com": 35 });
  assert.equal(saved.idleThresholdSeconds, 15);
  assert.equal(saved.warningPercent, 100);
});

test("uses a 30 minute idle threshold by default", async () => {
  const settings = await storage.getSettings();

  assert.equal(settings.idleThresholdSeconds, 1800);
});

test("caps idle threshold at one day", async () => {
  const saved = await storage.saveSettings({
    idleThresholdSeconds: 90000
  });

  assert.equal(saved.idleThresholdSeconds, 86400);
});

test("adds active time without replacing an existing total", async () => {
  await storage.addActiveTime("youtube.com", 5000, "2026-06-07");
  const stats = await storage.addActiveTime(
    "youtube.com",
    2500,
    "2026-06-07"
  );

  assert.equal(stats["youtube.com"].activeMs, 7500);
});

test("clears temporary blocks when the local date changes", async () => {
  await storage.saveRuntimeState({
    lastActiveDate: "2000-01-01",
    temporaryBlocks: ["youtube.com"]
  });

  const result = await storage.ensureCurrentDay();

  assert.equal(result.changed, true);
  assert.deepEqual(result.state.temporaryBlocks, []);
  assert.equal(result.state.lastActiveDate, storage.localDateKey());
});

test("does not reset the same local day twice", async () => {
  const today = storage.localDateKey();
  await storage.saveRuntimeState({
    lastActiveDate: today,
    temporaryBlocks: ["youtube.com"]
  });

  const result = await storage.ensureCurrentDay();

  assert.equal(result.changed, false);
  assert.deepEqual(result.state.temporaryBlocks, ["youtube.com"]);
});
