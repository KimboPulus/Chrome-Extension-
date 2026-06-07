"use strict";

(function exposeDomainHelpers(root) {
  const STRIPPED_PREFIXES = ["www.", "m."];

  function normalizeHostname(hostname) {
    let normalized = String(hostname || "")
      .trim()
      .toLowerCase()
      .replace(/\.$/, "");

    let prefixRemoved = true;
    while (prefixRemoved) {
      prefixRemoved = false;

      for (const prefix of STRIPPED_PREFIXES) {
        if (normalized.startsWith(prefix)) {
          normalized = normalized.slice(prefix.length);
          prefixRemoved = true;
        }
      }
    }

    return normalized;
  }

  function parseUrl(value) {
    const input = String(value || "").trim();
    if (!input) {
      return null;
    }

    try {
      return new URL(input.includes("://") ? input : `https://${input}`);
    } catch {
      return null;
    }
  }

  function normalizeSite(value) {
    const parsed = parseUrl(value);
    if (!parsed || !["http:", "https:"].includes(parsed.protocol)) {
      return "";
    }

    return normalizeHostname(parsed.hostname);
  }

  function isTrackableUrl(value) {
    const parsed = parseUrl(value);
    return Boolean(
      parsed &&
      ["http:", "https:"].includes(parsed.protocol) &&
      normalizeHostname(parsed.hostname)
    );
  }

  function domainMatches(hostname, ruleDomain) {
    const host = normalizeHostname(hostname);
    const rule = normalizeSite(ruleDomain);

    return Boolean(host && rule && (host === rule || host.endsWith(`.${rule}`)));
  }

  const api = {
    domainMatches,
    isTrackableUrl,
    normalizeHostname,
    normalizeSite,
    parseUrl
  };

  root.FocusDomain = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(globalThis);
