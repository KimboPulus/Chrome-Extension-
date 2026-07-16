import { dateKeys } from "../domain/analytics";
import { localDateKey, splitSessionByLocalDay } from "../domain/focus-engine";
import type {
  DailyUsage,
  DailyUsageSnapshot,
  FocusEngineState,
  FocusExport,
  FocusSession,
  RuntimeState,
  Settings,
} from "../domain/types";
import {
  DEFAULT_RUNTIME_STATE,
  ENGINE_KEY,
  isDateKey,
  isPlainRecord,
  RUNTIME_KEY,
  sanitizeDailyUsage,
  sanitizeEngineState,
  sanitizeRuntimeState,
  sanitizeSession,
  sanitizeSettings,
  SCHEMA_KEY,
  SCHEMA_VERSION,
  SETTINGS_KEY,
} from "./schema";

export interface StorageAreaLike {
  get(keys?: null | string | string[]): Promise<Record<string, unknown>>;
  getBytesInUse?(keys?: null | string | string[]): Promise<number>;
  remove(keys: string | string[]): Promise<void>;
  set(items: Record<string, unknown>): Promise<void>;
}

const MAX_DEDUPE_IDS_PER_DAY = 64;
const MAX_STORED_SESSIONS_PER_DAY = 100;

function statsKey(date: string): string {
  return `stats:${date}`;
}

function sessionsKey(date: string): string {
  return `sessions:${date}`;
}

function dedupeKey(date: string): string {
  return `dedupe:${date}`;
}

function dateFromDataKey(key: string): string {
  return key.slice(key.indexOf(":") + 1);
}

export class FocusRepository {
  constructor(
    private readonly local: StorageAreaLike,
    private readonly session: StorageAreaLike,
  ) {}

  async migrate(): Promise<number> {
    const stored = await this.local.get(null);
    const settings = sanitizeSettings(stored[SETTINGS_KEY]);
    const runtime = sanitizeRuntimeState(stored[RUNTIME_KEY]);
    const migrated: Record<string, unknown> = {
      [RUNTIME_KEY]: runtime,
      [SCHEMA_KEY]: SCHEMA_VERSION,
      [SETTINGS_KEY]: settings,
    };

    for (const [key, value] of Object.entries(stored)) {
      if (key.startsWith("stats:") && isDateKey(dateFromDataKey(key))) {
        migrated[key] = sanitizeDailyUsage(value);
      }
    }

    await this.local.set(migrated);
    return SCHEMA_VERSION;
  }

  async getSettings(): Promise<Settings> {
    const stored = await this.local.get(SETTINGS_KEY);
    return sanitizeSettings(stored[SETTINGS_KEY]);
  }

  async saveSettings(value: unknown): Promise<Settings> {
    const settings = sanitizeSettings(value);
    await this.local.set({ [SETTINGS_KEY]: settings });
    return settings;
  }

  async getRuntimeState(): Promise<RuntimeState> {
    const stored = await this.local.get(RUNTIME_KEY);
    return sanitizeRuntimeState(stored[RUNTIME_KEY]);
  }

  async saveRuntimeState(value: unknown): Promise<RuntimeState> {
    const runtime = sanitizeRuntimeState(value);
    await this.local.set({ [RUNTIME_KEY]: runtime });
    return runtime;
  }

  async getEngineState(): Promise<FocusEngineState> {
    const stored = await this.session.get(ENGINE_KEY);
    return sanitizeEngineState(stored[ENGINE_KEY]);
  }

  async saveEngineState(value: FocusEngineState): Promise<FocusEngineState> {
    const state = sanitizeEngineState(value);
    await this.session.set({ [ENGINE_KEY]: state });
    return state;
  }

  async getUsage(date = localDateKey()): Promise<DailyUsage> {
    const key = statsKey(date);
    const stored = await this.local.get(key);
    return sanitizeDailyUsage(stored[key]);
  }

  async getUsageRange(
    days: number,
    now = new Date(),
  ): Promise<DailyUsageSnapshot[]> {
    const keys = dateKeys(Math.min(365, Math.max(1, Math.round(days))), now);
    const stored = await this.local.get(keys.map(statsKey));
    return keys.map((date) => ({
      date,
      usage: sanitizeDailyUsage(stored[statsKey(date)]),
    }));
  }

  async recordSession(session: FocusSession): Promise<number> {
    let recordedMs = 0;

    for (const part of splitSessionByLocalDay(session)) {
      const date = localDateKey(new Date(part.startedAt));
      const usageKey = statsKey(date);
      const historyKey = sessionsKey(date);
      const processedKey = dedupeKey(date);
      const stored = await this.local.get([usageKey, historyKey, processedKey]);
      const usage = sanitizeDailyUsage(stored[usageKey]);
      const history = Array.isArray(stored[historyKey])
        ? stored[historyKey]
            .map(sanitizeSession)
            .filter((item) => item !== null)
        : [];
      const processedIds = Array.isArray(stored[processedKey])
        ? stored[processedKey].filter(
            (value): value is string => typeof value === "string",
          )
        : [];

      if (processedIds.includes(part.id)) {
        continue;
      }

      const previous = history.at(-1);
      const isContinuation =
        previous?.domain === part.domain &&
        previous.mode === part.mode &&
        previous.endedAt === part.startedAt;
      const entry = usage[part.domain] ?? {
        activeMs: 0,
        interactionMs: 0,
        lastActiveAt: 0,
        mediaMs: 0,
        sessionCount: 0,
      };

      entry.activeMs += part.durationMs;
      entry.lastActiveAt = Math.max(entry.lastActiveAt, part.endedAt);
      entry.sessionCount += isContinuation ? 0 : 1;
      if (part.mode === "media") {
        entry.mediaMs += part.durationMs;
      } else {
        entry.interactionMs += part.durationMs;
      }
      usage[part.domain] = entry;

      if (isContinuation && previous) {
        history[history.length - 1] = {
          ...previous,
          durationMs: previous.durationMs + part.durationMs,
          endedAt: part.endedAt,
        };
      } else {
        history.push(part);
      }

      await this.local.set({
        [historyKey]: history.slice(-MAX_STORED_SESSIONS_PER_DAY),
        [processedKey]: [...processedIds, part.id].slice(
          -MAX_DEDUPE_IDS_PER_DAY,
        ),
        [usageKey]: usage,
      });
      recordedMs += part.durationMs;
    }

    return recordedMs;
  }

  async ensureCurrentDay(
    now = new Date(),
  ): Promise<{ changed: boolean; state: RuntimeState }> {
    const today = localDateKey(now);
    const runtime = await this.getRuntimeState();
    if (runtime.lastActiveDate === today) {
      return { changed: false, state: runtime };
    }

    const state = await this.saveRuntimeState({
      ...runtime,
      activeFocusSession:
        runtime.activeFocusSession &&
        runtime.activeFocusSession.endsAt > now.getTime()
          ? runtime.activeFocusSession
          : null,
      lastActiveDate: today,
      temporaryBlocks: [],
      warnedDomains: [],
    });
    return { changed: true, state };
  }

  async pruneHistory(
    retentionDays: number,
    now = new Date(),
  ): Promise<string[]> {
    const cutoff = dateKeys(Math.min(365, Math.max(1, retentionDays)), now)[0];
    if (!cutoff) {
      return [];
    }

    const stored = await this.local.get(null);
    const staleKeys = Object.keys(stored).filter(
      (key) =>
        (key.startsWith("stats:") ||
          key.startsWith("sessions:") ||
          key.startsWith("dedupe:")) &&
        isDateKey(dateFromDataKey(key)) &&
        dateFromDataKey(key) < cutoff,
    );
    if (staleKeys.length > 0) {
      await this.local.remove(staleKeys);
    }
    return staleKeys;
  }

  async bytesInUse(): Promise<number> {
    return this.local.getBytesInUse ? this.local.getBytesInUse(null) : 0;
  }

  async exportData(now = new Date()): Promise<FocusExport> {
    const stored = await this.local.get(null);
    const usage: Record<string, DailyUsage> = {};
    const sessions: Record<string, FocusSession[]> = {};

    for (const [key, value] of Object.entries(stored)) {
      const date = dateFromDataKey(key);
      if (key.startsWith("stats:") && isDateKey(date)) {
        usage[date] = sanitizeDailyUsage(value);
      } else if (
        key.startsWith("sessions:") &&
        isDateKey(date) &&
        Array.isArray(value)
      ) {
        sessions[date] = value
          .map(sanitizeSession)
          .filter((item) => item !== null);
      }
    }

    return {
      exportedAt: now.toISOString(),
      product: "Focus Meter",
      schemaVersion: SCHEMA_VERSION,
      sessions,
      settings: sanitizeSettings(stored[SETTINGS_KEY]),
      usage,
    };
  }

  async resetUsage(): Promise<void> {
    const stored = await this.local.get(null);
    const keys = Object.keys(stored).filter(
      (key) =>
        key.startsWith("stats:") ||
        key.startsWith("sessions:") ||
        key.startsWith("dedupe:"),
    );
    if (keys.length > 0) {
      await this.local.remove(keys);
    }
    await this.local.set({
      [RUNTIME_KEY]: sanitizeRuntimeState(DEFAULT_RUNTIME_STATE),
    });
    await this.session.remove(ENGINE_KEY);
  }

  async importData(value: unknown): Promise<void> {
    if (!isPlainRecord(value) || value.product !== "Focus Meter") {
      throw new Error("Backup is not a Focus Meter export.");
    }

    const usage = isPlainRecord(value.usage) ? value.usage : {};
    const sessions = isPlainRecord(value.sessions) ? value.sessions : {};
    await this.resetUsage();

    const restored: Record<string, unknown> = {
      [SCHEMA_KEY]: SCHEMA_VERSION,
      [SETTINGS_KEY]: sanitizeSettings(value.settings),
    };

    for (const [date, dayUsage] of Object.entries(usage)) {
      if (isDateKey(date)) {
        restored[statsKey(date)] = sanitizeDailyUsage(dayUsage);
      }
    }
    for (const [date, daySessions] of Object.entries(sessions)) {
      if (isDateKey(date) && Array.isArray(daySessions)) {
        restored[sessionsKey(date)] = daySessions
          .map(sanitizeSession)
          .filter((item) => item !== null)
          .slice(-MAX_STORED_SESSIONS_PER_DAY);
      }
    }

    await this.local.set(restored);
  }
}
