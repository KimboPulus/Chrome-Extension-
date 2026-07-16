import { getDomain } from "tldts";

const TRACKABLE_PROTOCOLS = new Set(["http:", "https:"]);

export function normalizeHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/\.$/, "");
}

export function parseUrl(value: unknown): URL | null {
  const input =
    typeof value === "string"
      ? value.trim()
      : value instanceof URL
        ? value.href
        : "";
  if (!input) {
    return null;
  }

  try {
    return new URL(input.includes("://") ? input : `https://${input}`);
  } catch {
    return null;
  }
}

export function normalizeSite(value: unknown): string {
  const parsed = parseUrl(value);
  if (!parsed || !TRACKABLE_PROTOCOLS.has(parsed.protocol)) {
    return "";
  }

  const hostname = normalizeHostname(parsed.hostname);
  return getDomain(hostname, { allowPrivateDomains: true }) ?? hostname;
}

export function isTrackableUrl(value: unknown): boolean {
  const parsed = parseUrl(value);
  return Boolean(
    parsed &&
    TRACKABLE_PROTOCOLS.has(parsed.protocol) &&
    normalizeHostname(parsed.hostname),
  );
}

export function domainMatches(hostname: unknown, ruleDomain: unknown): boolean {
  const host = normalizeHostname(typeof hostname === "string" ? hostname : "");
  const rule = normalizeSite(ruleDomain);
  return Boolean(host && rule && (host === rule || host.endsWith(`.${rule}`)));
}

export function normalizeSiteList(values: unknown): string[] {
  if (!Array.isArray(values)) {
    return [];
  }

  return [...new Set(values.map(normalizeSite).filter(Boolean))].sort();
}
