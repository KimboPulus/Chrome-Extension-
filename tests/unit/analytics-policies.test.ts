import {
  calculateFocusScore,
  dateKeys,
  formatDuration,
  totalActiveMs,
  usageToCsv,
} from "../../src/domain/analytics";
import {
  collectBlockedDomains,
  isScheduleActive,
  totalUsageForRule,
} from "../../src/domain/policies";
import { DEFAULT_SETTINGS } from "../../src/storage/schema";
import type {
  DailyUsage,
  RuntimeState,
  Settings,
} from "../../src/domain/types";

const usage: DailyUsage = {
  "docs.example.com": {
    activeMs: 60_000,
    interactionMs: 60_000,
    lastActiveAt: 1,
    mediaMs: 0,
    sessionCount: 1,
  },
  "youtube.com": {
    activeMs: 30_000,
    interactionMs: 0,
    lastActiveAt: 1,
    mediaMs: 30_000,
    sessionCount: 1,
  },
};

const runtime: RuntimeState = {
  activeFocusSession: null,
  lastActiveDate: "2026-07-16",
  temporaryBlocks: [],
  warnedDomains: [],
};

describe("analytics", () => {
  it("calculates a transparent focus score", () => {
    expect(
      calculateFocusScore(usage, {
        "example.com": "productive",
        "youtube.com": "distracting",
      }),
    ).toBe(67);
    expect(calculateFocusScore(usage, {})).toBeNull();
    expect(totalActiveMs(usage)).toBe(90_000);
  });

  it("formats durations and CSV exports deterministically", () => {
    expect(formatDuration(90 * 60_000)).toBe("1h 30m");
    expect(usageToCsv([{ date: "2026-07-16", usage }]).split("\n")[0]).toBe(
      "date,domain,active_ms,interaction_ms,media_ms,sessions",
    );
  });

  it("generates local date ranges", () => {
    expect(dateKeys(3, new Date(2026, 6, 16, 23, 0))).toEqual([
      "2026-07-14",
      "2026-07-15",
      "2026-07-16",
    ]);
  });
});

describe("focus policies", () => {
  it("supports daytime and overnight schedules", () => {
    const daytime = {
      blockedSites: ["youtube.com"],
      days: [4],
      enabled: true,
      end: "17:00",
      start: "09:00",
    };
    const overnight = { ...daytime, end: "06:00", start: "22:00" };

    expect(isScheduleActive(daytime, new Date(2026, 6, 16, 10, 0))).toBe(true);
    expect(isScheduleActive(daytime, new Date(2026, 6, 16, 18, 0))).toBe(false);
    expect(isScheduleActive(overnight, new Date(2026, 6, 17, 2, 0))).toBe(true);
  });

  it("combines manual, budget, schedule, and manual-session blocks", () => {
    const settings: Settings = {
      ...DEFAULT_SETTINGS,
      blockedSites: ["manual.example"],
      dailyLimits: { "youtube.com": 0.5 },
      focusSchedule: {
        blockedSites: ["schedule.example"],
        days: [4],
        enabled: true,
        end: "17:00",
        start: "09:00",
      },
    };
    const activeRuntime: RuntimeState = {
      ...runtime,
      activeFocusSession: {
        blockedSites: ["session.example"],
        endsAt: new Date(2026, 6, 16, 11, 0).getTime(),
        startedAt: new Date(2026, 6, 16, 9, 0).getTime(),
      },
    };
    const blocked = collectBlockedDomains(
      settings,
      activeRuntime,
      usage,
      new Date(2026, 6, 16, 10, 0),
    );

    expect(blocked).toEqual(
      new Map([
        ["manual.example", "manual"],
        ["youtube.com", "limit"],
        ["schedule.example", "schedule"],
        ["session.example", "focus-session"],
      ]),
    );
    expect(totalUsageForRule(usage, "example.com")).toBe(60_000);
  });
});
