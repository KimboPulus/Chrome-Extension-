import { domainMatches } from "./domain";
import { localDateKey } from "./focus-engine";
import type {
  DailyUsage,
  DailyUsageSnapshot,
  SiteCategory,
  UsageEntry,
} from "./types";

export function totalActiveMs(usage: DailyUsage): number {
  return Object.values(usage).reduce(
    (total, entry) => total + entry.activeMs,
    0,
  );
}

export function resolveCategory(
  domain: string,
  categories: Record<string, SiteCategory>,
): SiteCategory {
  const match = Object.entries(categories).find(([rule]) =>
    domainMatches(domain, rule),
  );
  return match?.[1] ?? "neutral";
}

export function calculateFocusScore(
  usage: DailyUsage,
  categories: Record<string, SiteCategory>,
): number | null {
  let productiveMs = 0;
  let distractingMs = 0;

  for (const [domain, entry] of Object.entries(usage)) {
    const category = resolveCategory(domain, categories);
    if (category === "productive") {
      productiveMs += entry.activeMs;
    } else if (category === "distracting") {
      distractingMs += entry.activeMs;
    }
  }

  const scoredMs = productiveMs + distractingMs;
  return scoredMs === 0 ? null : Math.round((productiveMs / scoredMs) * 100);
}

export function dateKeys(days: number, now = new Date()): string[] {
  const result: string[] = [];
  const cursor = new Date(now);
  cursor.setHours(12, 0, 0, 0);

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(cursor);
    date.setDate(cursor.getDate() - offset);
    result.push(localDateKey(date));
  }

  return result;
}

export function formatDuration(milliseconds: number): string {
  const minutes = Math.max(0, Math.round(milliseconds / 60_000));
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return hours > 0 ? `${hours}h ${remainder}m` : `${remainder}m`;
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function usageToCsv(days: DailyUsageSnapshot[]): string {
  const rows: Array<Array<string | number>> = [
    ["date", "domain", "active_ms", "interaction_ms", "media_ms", "sessions"],
  ];

  for (const day of days) {
    for (const [domain, entry] of Object.entries(day.usage).sort(([a], [b]) =>
      a.localeCompare(b),
    )) {
      rows.push([
        day.date,
        domain,
        entry.activeMs,
        entry.interactionMs,
        entry.mediaMs,
        entry.sessionCount,
      ]);
    }
  }

  return `${rows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}

export function emptyUsageEntry(): UsageEntry {
  return {
    activeMs: 0,
    interactionMs: 0,
    lastActiveAt: 0,
    mediaMs: 0,
    sessionCount: 0,
  };
}
