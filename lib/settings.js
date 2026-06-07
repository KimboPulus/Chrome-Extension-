"use strict";

(function exposeSettingsHelpers(root) {
  function parseBlockedSites(text, normalizeSite) {
    const sites = [];
    const values = String(text || "").split(/[\s,;]+/);

    for (const value of values) {
      const input = value.trim();
      if (!input) {
        continue;
      }

      const domain = normalizeSite(input);
      if (!domain) {
        throw new Error(`"${input}" is not a valid website.`);
      }

      sites.push(domain);
    }

    return [...new Set(sites)];
  }

  function parseDailyLimits(rows, normalizeSite) {
    const limits = {};

    for (const row of rows) {
      const rawDomain = String(row.domain || "").trim();
      if (!rawDomain) {
        continue;
      }

      const domain = normalizeSite(rawDomain);
      const minutes = Number(row.minutes);

      if (!domain) {
        throw new Error(`"${rawDomain}" is not a valid website.`);
      }

      if (!Number.isFinite(minutes) || minutes < 1 || minutes > 1440) {
        throw new Error(`Enter a limit from 1 to 1440 minutes for ${domain}.`);
      }

      if (Object.hasOwn(limits, domain)) {
        throw new Error(`${domain} has more than one daily limit.`);
      }

      limits[domain] = Math.round(minutes);
    }

    return limits;
  }

  const api = {
    parseBlockedSites,
    parseDailyLimits
  };

  root.FocusSettings = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(globalThis);
