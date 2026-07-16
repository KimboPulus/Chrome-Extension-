import { normalizeSite, normalizeSiteList } from "../domain/domain";
import { createInitialEngineState } from "../domain/focus-engine";
import { ACTIVITY_MODES } from "../domain/types";
import type {
  DailyUsage,
  FocusEngineState,
  FocusSchedule,
  FocusSession,
  RuntimeState,
  Settings,
  SiteCategory,
  UsageEntry,
} from "../domain/types";

export const SCHEMA_VERSION = 2;
export const SETTINGS_KEY = "settings";
export const RUNTIME_KEY = "runtimeState";
export const ENGINE_KEY = "focusEngineState";
export const SCHEMA_KEY = "schemaVersion";

export const DEFAULT_FOCUS_SCHEDULE: Readonly<FocusSchedule> = Object.freeze({
  blockedSites: [],
  days: [1, 2, 3, 4, 5],
  enabled: false,
  end: "17:00",
  start: "09:00",
});

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
  blockedSites: [],
  categories: {},
  dailyLimits: {},
  focusSchedule: DEFAULT_FOCUS_SCHEDULE,
  idleThresholdSeconds: 1800,
  retentionDays: 30,
  trackingEnabled: true,
  warningPercent: 80,
});

export const DEFAULT_RUNTIME_STATE: Readonly<RuntimeState> = Object.freeze({
  activeFocusSession: null,
  lastActiveDate: "",
  temporaryBlocks: [],
  warnedDomains: [],
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function sanitizeTime(value: unknown, fallback: string): string {
  const time = typeof value === "string" ? value : "";
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time) ? time : fallback;
}

export function sanitizeFocusSchedule(value: unknown): FocusSchedule {
  const source = isRecord(value) ? value : {};
  const days = Array.isArray(source.days)
    ? [
        ...new Set(
          source.days
            .map(Number)
            .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6),
        ),
      ].sort()
    : [...DEFAULT_FOCUS_SCHEDULE.days];

  return {
    blockedSites: normalizeSiteList(source.blockedSites),
    days,
    enabled: source.enabled === true,
    end: sanitizeTime(source.end, DEFAULT_FOCUS_SCHEDULE.end),
    start: sanitizeTime(source.start, DEFAULT_FOCUS_SCHEDULE.start),
  };
}

export function sanitizeSettings(value: unknown): Settings {
  const source = isRecord(value) ? value : {};
  const dailyLimits: Record<string, number> = {};
  const categories: Record<string, SiteCategory> = {};

  if (isRecord(source.dailyLimits)) {
    for (const [rawDomain, rawMinutes] of Object.entries(source.dailyLimits)) {
      const domain = normalizeSite(rawDomain);
      const minutes = finiteNumber(rawMinutes, 0);
      if (domain && minutes > 0) {
        dailyLimits[domain] = Math.min(1440, Math.max(1, Math.round(minutes)));
      }
    }
  }

  if (isRecord(source.categories)) {
    for (const [rawDomain, rawCategory] of Object.entries(source.categories)) {
      const domain = normalizeSite(rawDomain);
      if (
        domain &&
        typeof rawCategory === "string" &&
        ["productive", "neutral", "distracting"].includes(rawCategory)
      ) {
        categories[domain] = rawCategory as SiteCategory;
      }
    }
  }

  return {
    blockedSites: normalizeSiteList(source.blockedSites),
    categories,
    dailyLimits,
    focusSchedule: sanitizeFocusSchedule(source.focusSchedule),
    idleThresholdSeconds: Math.min(
      86_400,
      Math.max(15, Math.round(finiteNumber(source.idleThresholdSeconds, 1800))),
    ),
    retentionDays: Math.min(
      365,
      Math.max(1, Math.round(finiteNumber(source.retentionDays, 30))),
    ),
    trackingEnabled: source.trackingEnabled !== false,
    warningPercent: Math.min(
      100,
      Math.max(1, Math.round(finiteNumber(source.warningPercent, 80))),
    ),
  };
}

export function sanitizeRuntimeState(value: unknown): RuntimeState {
  const source = isRecord(value) ? value : {};
  const rawSession = isRecord(source.activeFocusSession)
    ? source.activeFocusSession
    : null;
  const startedAt = finiteNumber(rawSession?.startedAt, 0);
  const endsAt = finiteNumber(rawSession?.endsAt, 0);

  return {
    activeFocusSession:
      rawSession && startedAt > 0 && endsAt > startedAt
        ? {
            blockedSites: normalizeSiteList(rawSession.blockedSites),
            endsAt,
            startedAt,
          }
        : null,
    lastActiveDate:
      typeof source.lastActiveDate === "string" ? source.lastActiveDate : "",
    temporaryBlocks: normalizeSiteList(source.temporaryBlocks),
    warnedDomains: normalizeSiteList(source.warnedDomains),
  };
}

export function sanitizeEngineState(value: unknown): FocusEngineState {
  const source = isRecord(value) ? value : {};
  const initial = createInitialEngineState();
  const active = isRecord(source.active) ? source.active : null;
  const mode = active?.mode;
  const rawIdleState =
    typeof source.idleState === "string" ? source.idleState : "";
  const idleState = ["active", "idle", "locked"].includes(rawIdleState)
    ? (rawIdleState as FocusEngineState["idleState"])
    : initial.idleState;

  return {
    active:
      active &&
      typeof active.domain === "string" &&
      ACTIVITY_MODES.includes(mode as (typeof ACTIVITY_MODES)[number]) &&
      Number.isInteger(active.tabId) &&
      Number.isInteger(active.windowId) &&
      Number.isFinite(active.lastPulseAt) &&
      Number.isFinite(active.startedAt)
        ? {
            domain: active.domain,
            lastPulseAt: Number(active.lastPulseAt),
            mode: mode as (typeof ACTIVITY_MODES)[number],
            startedAt: Number(active.startedAt),
            tabId: Number(active.tabId),
            windowId: Number(active.windowId),
          }
        : null,
    idleState,
    lastEventAt: Math.max(0, finiteNumber(source.lastEventAt, 0)),
    version: 1,
  };
}

export function sanitizeUsageEntry(value: unknown): UsageEntry {
  const source = isRecord(value) ? value : {};
  return {
    activeMs: Math.max(0, Math.round(finiteNumber(source.activeMs, 0))),
    interactionMs: Math.max(
      0,
      Math.round(
        finiteNumber(
          source.interactionMs,
          source.activeMs ? Number(source.activeMs) : 0,
        ),
      ),
    ),
    lastActiveAt: Math.max(0, Math.round(finiteNumber(source.lastActiveAt, 0))),
    mediaMs: Math.max(0, Math.round(finiteNumber(source.mediaMs, 0))),
    sessionCount: Math.max(0, Math.round(finiteNumber(source.sessionCount, 0))),
  };
}

export function sanitizeDailyUsage(value: unknown): DailyUsage {
  if (!isRecord(value)) {
    return {};
  }

  const usage: DailyUsage = {};
  for (const [rawDomain, entry] of Object.entries(value)) {
    const domain = normalizeSite(rawDomain);
    if (domain) {
      usage[domain] = sanitizeUsageEntry(entry);
    }
  }
  return usage;
}

export function sanitizeSession(value: unknown): FocusSession | null {
  if (!isRecord(value)) {
    return null;
  }

  const domain = normalizeSite(value.domain);
  const mode = value.mode;
  const startedAt = finiteNumber(value.startedAt, 0);
  const endedAt = finiteNumber(value.endedAt, 0);
  const durationMs = finiteNumber(value.durationMs, endedAt - startedAt);
  const id = typeof value.id === "string" ? value.id : "";

  if (
    !domain ||
    !ACTIVITY_MODES.includes(mode as (typeof ACTIVITY_MODES)[number]) ||
    !id ||
    startedAt < 0 ||
    endedAt <= startedAt ||
    durationMs <= 0
  ) {
    return null;
  }

  return {
    domain,
    durationMs: Math.min(
      Math.round(durationMs),
      Math.round(endedAt - startedAt),
    ),
    endedAt: Math.round(endedAt),
    id,
    mode: mode as (typeof ACTIVITY_MODES)[number],
    startedAt: Math.round(startedAt),
  };
}

export function isDateKey(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function isPlainRecord(
  value: unknown,
): value is Record<string, unknown> {
  return isRecord(value);
}
