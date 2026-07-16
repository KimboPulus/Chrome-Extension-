import { domainMatches } from "./domain";
import type {
  BlockReason,
  DailyUsage,
  FocusSchedule,
  RuntimeState,
  Settings,
} from "./types";

export function totalUsageForRule(
  usage: DailyUsage,
  ruleDomain: string,
): number {
  return Object.entries(usage).reduce(
    (total, [domain, entry]) =>
      domainMatches(domain, ruleDomain) ? total + entry.activeMs : total,
    0,
  );
}

export function findMatchingLimit(
  domain: string,
  dailyLimits: Record<string, number>,
): { domain: string; minutes: number } | null {
  for (const [ruleDomain, minutes] of Object.entries(dailyLimits)) {
    if (domainMatches(domain, ruleDomain)) {
      return { domain: ruleDomain, minutes };
    }
  }
  return null;
}

function timeToMinutes(value: string): number {
  const [hours = "0", minutes = "0"] = value.split(":");
  return Number(hours) * 60 + Number(minutes);
}

export function isScheduleActive(
  schedule: FocusSchedule,
  now = new Date(),
): boolean {
  if (!schedule.enabled || schedule.days.length === 0) {
    return false;
  }

  const start = timeToMinutes(schedule.start);
  const end = timeToMinutes(schedule.end);
  const current = now.getHours() * 60 + now.getMinutes();
  const day = now.getDay();

  if (start === end) {
    return schedule.days.includes(day);
  }
  if (start < end) {
    return schedule.days.includes(day) && current >= start && current < end;
  }

  const previousDay = (day + 6) % 7;
  return (
    (schedule.days.includes(day) && current >= start) ||
    (schedule.days.includes(previousDay) && current < end)
  );
}

export function collectBlockedDomains(
  settings: Settings,
  runtime: RuntimeState,
  usage: DailyUsage,
  now = new Date(),
): Map<string, BlockReason> {
  const blocked = new Map<string, BlockReason>();

  for (const domain of settings.blockedSites) {
    blocked.set(domain, "manual");
  }

  for (const [domain, minutes] of Object.entries(settings.dailyLimits)) {
    if (totalUsageForRule(usage, domain) >= minutes * 60_000) {
      blocked.set(domain, "limit");
    }
  }

  if (isScheduleActive(settings.focusSchedule, now)) {
    for (const domain of settings.focusSchedule.blockedSites) {
      blocked.set(domain, "schedule");
    }
  }

  if (
    runtime.activeFocusSession &&
    runtime.activeFocusSession.endsAt > now.getTime()
  ) {
    for (const domain of runtime.activeFocusSession.blockedSites) {
      blocked.set(domain, "focus-session");
    }
  }

  return blocked;
}

export function blockReasonForDomain(
  domain: string,
  blockedDomains: Map<string, BlockReason>,
): { domain: string; reason: BlockReason } | null {
  for (const [ruleDomain, reason] of blockedDomains) {
    if (domainMatches(domain, ruleDomain)) {
      return { domain: ruleDomain, reason };
    }
  }
  return null;
}
