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

  function secondsToMinutes(seconds) {
    const numericSeconds = Number(seconds);
    if (!Number.isFinite(numericSeconds)) {
      return 1;
    }

    return Math.round((numericSeconds / 60) * 100) / 100;
  }

  function minutesToSeconds(minutes) {
    const numericMinutes = Number(minutes);
    if (
      !Number.isFinite(numericMinutes) ||
      numericMinutes < 0.25 ||
      numericMinutes > 15
    ) {
      throw new Error("Idle threshold must be between 0.25 and 15 minutes.");
    }

    return Math.round(numericMinutes * 60);
  }

  const api = {
    minutesToSeconds,
    parseBlockedSites,
    parseDailyLimits,
    secondsToMinutes
  };

  root.FocusSettings = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(globalThis);
