"use strict";

(function exposeStorageHelpers(root) {
  const SETTINGS_KEY = "settings";
  const RUNTIME_KEY = "runtimeState";

  const DEFAULT_SETTINGS = Object.freeze({
    blockedSites: [],
    dailyLimits: {},
    idleThresholdSeconds: 60,
    warningPercent: 80
  });

  const DEFAULT_RUNTIME_STATE = Object.freeze({
    lastActiveDate: "",
    temporaryBlocks: []
  });

  function localDateKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function statsKey(dateKey = localDateKey()) {
    return `stats:${dateKey}`;
  }

  function uniqueStrings(values) {
    return [...new Set((Array.isArray(values) ? values : []).filter(Boolean))];
  }

  function sanitizeSettings(value = {}) {
    const dailyLimits = {};

    for (const [domain, minutes] of Object.entries(value.dailyLimits || {})) {
      const numericMinutes = Number(minutes);
      if (domain && Number.isFinite(numericMinutes) && numericMinutes > 0) {
        dailyLimits[domain] = Math.min(1440, Math.round(numericMinutes));
      }
    }

    const idleThreshold = Number(value.idleThresholdSeconds);
    const warningPercent = Number(value.warningPercent);

    return {
      blockedSites: uniqueStrings(value.blockedSites),
      dailyLimits,
      idleThresholdSeconds: Number.isFinite(idleThreshold)
        ? Math.min(900, Math.max(15, Math.round(idleThreshold)))
        : DEFAULT_SETTINGS.idleThresholdSeconds,
      warningPercent: Number.isFinite(warningPercent)
        ? Math.min(100, Math.max(1, Math.round(warningPercent)))
        : DEFAULT_SETTINGS.warningPercent
    };
  }

  function sanitizeRuntimeState(value = {}) {
    return {
      lastActiveDate:
        typeof value.lastActiveDate === "string" ? value.lastActiveDate : "",
      temporaryBlocks: uniqueStrings(value.temporaryBlocks)
    };
  }

  function requireStorage() {
    if (!root.chrome?.storage?.local) {
      throw new Error("Chrome local storage is unavailable.");
    }

    return root.chrome.storage.local;
  }

  async function getSettings() {
    const result = await requireStorage().get(SETTINGS_KEY);
    return sanitizeSettings({
      ...DEFAULT_SETTINGS,
      ...(result[SETTINGS_KEY] || {})
    });
  }

  async function saveSettings(settings) {
    const cleanSettings = sanitizeSettings(settings);
    await requireStorage().set({ [SETTINGS_KEY]: cleanSettings });
    return cleanSettings;
  }

  async function getStats(dateKey = localDateKey()) {
    const key = statsKey(dateKey);
    const result = await requireStorage().get(key);
    return result[key] && typeof result[key] === "object" ? result[key] : {};
  }

  async function saveStats(stats, dateKey = localDateKey()) {
    const key = statsKey(dateKey);
    await requireStorage().set({ [key]: stats });
  }

  async function addActiveTime(domain, milliseconds, dateKey = localDateKey()) {
    const amount = Math.max(0, Math.round(Number(milliseconds) || 0));
    if (!domain || amount === 0) {
      return getStats(dateKey);
    }

    const stats = await getStats(dateKey);
    const current = stats[domain] || { activeMs: 0 };

    stats[domain] = {
      ...current,
      activeMs: Math.max(0, Number(current.activeMs) || 0) + amount
    };

    await saveStats(stats, dateKey);
    return stats;
  }

  async function getRuntimeState() {
    const result = await requireStorage().get(RUNTIME_KEY);
    return sanitizeRuntimeState({
      ...DEFAULT_RUNTIME_STATE,
      ...(result[RUNTIME_KEY] || {})
    });
  }

  async function saveRuntimeState(state) {
    const cleanState = sanitizeRuntimeState(state);
    await requireStorage().set({ [RUNTIME_KEY]: cleanState });
    return cleanState;
  }

  async function ensureCurrentDay() {
    const today = localDateKey();
    const state = await getRuntimeState();

    if (state.lastActiveDate === today) {
      return { changed: false, state };
    }

    const nextState = await saveRuntimeState({
      lastActiveDate: today,
      temporaryBlocks: []
    });

    return { changed: true, state: nextState };
  }

  async function addTemporaryBlock(domain) {
    const state = await getRuntimeState();
    if (state.temporaryBlocks.includes(domain)) {
      return state;
    }

    return saveRuntimeState({
      ...state,
      temporaryBlocks: [...state.temporaryBlocks, domain]
    });
  }

  const api = {
    DEFAULT_SETTINGS,
    addActiveTime,
    addTemporaryBlock,
    ensureCurrentDay,
    getRuntimeState,
    getSettings,
    getStats,
    localDateKey,
    sanitizeSettings,
    saveRuntimeState,
    saveSettings,
    saveStats,
    statsKey
  };

  root.FocusStorage = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(globalThis);
