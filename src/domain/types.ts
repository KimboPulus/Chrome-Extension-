export const ACTIVITY_MODES = ["interaction", "media", "foreground"] as const;

export type ActivityMode = (typeof ACTIVITY_MODES)[number];
export type IdleState = "active" | "idle" | "locked";
export type SiteCategory = "productive" | "neutral" | "distracting";
export type BlockReason = "manual" | "limit" | "schedule" | "focus-session";

export interface FocusSchedule {
  blockedSites: string[];
  days: number[];
  enabled: boolean;
  end: string;
  start: string;
}

export interface Settings {
  blockedSites: string[];
  categories: Record<string, SiteCategory>;
  dailyLimits: Record<string, number>;
  focusSchedule: FocusSchedule;
  idleThresholdSeconds: number;
  retentionDays: number;
  trackingEnabled: boolean;
  warningPercent: number;
}

export interface ActiveFocusSession {
  blockedSites: string[];
  endsAt: number;
  startedAt: number;
}

export interface RuntimeState {
  activeFocusSession: ActiveFocusSession | null;
  lastActiveDate: string;
  temporaryBlocks: string[];
  warnedDomains: string[];
}

export interface ActiveTarget {
  domain: string;
  lastPulseAt: number;
  mode: ActivityMode;
  startedAt: number;
  tabId: number;
  windowId: number;
}

export interface FocusEngineState {
  active: ActiveTarget | null;
  idleState: IdleState;
  lastEventAt: number;
  version: 1;
}

export type FocusEvent =
  | {
      at: number;
      domain: string;
      mode: ActivityMode;
      tabId: number;
      type: "ACTIVITY_PULSE";
      windowId: number;
    }
  | { at: number; tabId: number; type: "TAB_ACTIVATED"; windowId: number }
  | { at: number; tabId: number; type: "TAB_REMOVED" }
  | { at: number; tabId: number; type: "URL_CHANGED" }
  | {
      at: number;
      focusedWindowId: number | null;
      type: "WINDOW_FOCUS_CHANGED";
    }
  | { at: number; state: IdleState; type: "IDLE_STATE_CHANGED" }
  | { at: number; type: "CHECKPOINT" }
  | { at: number; type: "RESET" };

export interface FocusSession {
  domain: string;
  durationMs: number;
  endedAt: number;
  id: string;
  mode: ActivityMode;
  startedAt: number;
}

export interface UsageEntry {
  activeMs: number;
  interactionMs: number;
  lastActiveAt: number;
  mediaMs: number;
  sessionCount: number;
}

export type DailyUsage = Record<string, UsageEntry>;

export interface DailyUsageSnapshot {
  date: string;
  usage: DailyUsage;
}

export interface DashboardData {
  bytesInUse: number;
  days: DailyUsageSnapshot[];
  runtime: RuntimeState;
  settings: Settings;
}

export interface FocusExport {
  exportedAt: string;
  product: "Focus Meter";
  schemaVersion: number;
  sessions: Record<string, FocusSession[]>;
  settings: Settings;
  usage: Record<string, DailyUsage>;
}
