import {
  sanitizeDailyUsage,
  sanitizeEngineState,
  sanitizeFocusSchedule,
  sanitizeRuntimeState,
  sanitizeSession,
  sanitizeSettings,
} from "../../src/storage/schema";

describe("storage schema validation", () => {
  it("sanitizes settings and normalizes domains", () => {
    expect(
      sanitizeSettings({
        blockedSites: ["www.youtube.com", "youtube.com", ""],
        categories: { "docs.example.com": "productive", bad: "unknown" },
        dailyLimits: { "m.youtube.com": 35.4, invalid: -2 },
        focusSchedule: {
          blockedSites: ["www.reddit.com"],
          days: [5, 1, 1, 9],
          enabled: true,
          end: "99:00",
          start: "08:30",
        },
        idleThresholdSeconds: 4,
        retentionDays: 900,
        warningPercent: 120,
      }),
    ).toEqual({
      blockedSites: ["youtube.com"],
      categories: { "example.com": "productive" },
      dailyLimits: { "youtube.com": 35 },
      focusSchedule: {
        blockedSites: ["reddit.com"],
        days: [1, 5],
        enabled: true,
        end: "17:00",
        start: "08:30",
      },
      idleThresholdSeconds: 15,
      retentionDays: 365,
      trackingEnabled: true,
      warningPercent: 100,
    });
  });

  it("recovers from corrupt runtime and engine values", () => {
    expect(
      sanitizeRuntimeState({
        activeFocusSession: { endsAt: 1 },
        temporaryBlocks: 4,
      }),
    ).toMatchObject({ activeFocusSession: null, temporaryBlocks: [] });
    expect(
      sanitizeEngineState({
        active: {
          domain: "x",
          lastPulseAt: "bad",
          mode: "media",
          tabId: 1,
          windowId: 1,
        },
        idleState: "unknown",
        lastEventAt: -3,
      }),
    ).toEqual({
      active: null,
      idleState: "active",
      lastEventAt: 0,
      version: 1,
    });
  });

  it("migrates legacy usage entries", () => {
    expect(
      sanitizeDailyUsage({ "www.youtube.com": { activeMs: 5000 } }),
    ).toEqual({
      "youtube.com": {
        activeMs: 5000,
        interactionMs: 5000,
        lastActiveAt: 0,
        mediaMs: 0,
        sessionCount: 0,
      },
    });
  });

  it("validates schedules and session records", () => {
    expect(sanitizeFocusSchedule(null)).toMatchObject({
      enabled: false,
      start: "09:00",
    });
    expect(sanitizeSession(null)).toBeNull();
    expect(sanitizeSession({ id: "bad" })).toBeNull();
    expect(
      sanitizeSession({
        domain: "www.example.com",
        durationMs: 9999,
        endedAt: 2000,
        id: "valid",
        mode: "interaction",
        startedAt: 1000,
      }),
    ).toEqual({
      domain: "example.com",
      durationMs: 1000,
      endedAt: 2000,
      id: "valid",
      mode: "interaction",
      startedAt: 1000,
    });
  });
});
