"use strict";

importScripts("lib/domain.js", "lib/storage.js");

const MAX_INCREMENT_MS = 10000;
const activitySessions = new Map();
let storageQueue = Promise.resolve();
let initializationPromise;

function queueStorageWork(task) {
  storageQueue = storageQueue.then(task, task);
  return storageQueue;
}

function clearActivitySessions() {
  activitySessions.clear();
}

function findMatchingLimit(domain, dailyLimits) {
  for (const [ruleDomain, minutes] of Object.entries(dailyLimits)) {
    if (FocusDomain.domainMatches(domain, ruleDomain)) {
      return { domain: ruleDomain, minutes };
    }
  }

  return null;
}

function matchesAnyRule(domain, rules) {
  return rules.some((rule) => FocusDomain.domainMatches(domain, rule));
}

function totalUsageForDomain(stats, ruleDomain) {
  return Object.entries(stats).reduce((total, [domain, data]) => {
    if (!FocusDomain.domainMatches(domain, ruleDomain)) {
      return total;
    }

    return total + Math.max(0, Number(data.activeMs) || 0);
  }, 0);
}

function blockedPageUrl(domain, reason) {
  const pageUrl = new URL(chrome.runtime.getURL("blocked/blocked.html"));
  pageUrl.searchParams.set("domain", domain);
  pageUrl.searchParams.set("reason", reason);
  return pageUrl.toString();
}

async function rebuildBlockingRules() {
  const [settings, storedRuntimeState, currentRules, stats] = await Promise.all([
    FocusStorage.getSettings(),
    FocusStorage.getRuntimeState(),
    chrome.declarativeNetRequest.getDynamicRules(),
    FocusStorage.getStats()
  ]);

  const reachedLimits = Object.entries(settings.dailyLimits)
    .filter(
      ([domain, minutes]) =>
        totalUsageForDomain(stats, domain) >= minutes * 60000
    )
    .map(([domain]) => domain);

  let runtimeState = storedRuntimeState;
  if (
    reachedLimits.length !== storedRuntimeState.temporaryBlocks.length ||
    reachedLimits.some(
      (domain) => !storedRuntimeState.temporaryBlocks.includes(domain)
    )
  ) {
    runtimeState = await FocusStorage.saveRuntimeState({
      ...storedRuntimeState,
      temporaryBlocks: reachedLimits
    });
  }

  const blockedDomains = new Map();
  for (const domain of settings.blockedSites) {
    blockedDomains.set(domain, "manual");
  }
  for (const domain of runtimeState.temporaryBlocks) {
    if (!blockedDomains.has(domain)) {
      blockedDomains.set(domain, "limit");
    }
  }

  const addRules = [...blockedDomains.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([domain, reason], index) => ({
      id: index + 1,
      priority: 1,
      action: {
        type: "redirect",
        redirect: {
          url: blockedPageUrl(domain, reason)
        }
      },
      condition: {
        requestDomains: [domain],
        resourceTypes: ["main_frame"]
      }
    }));

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: currentRules.map((rule) => rule.id),
    addRules
  });

  const openTabs = await chrome.tabs.query({});
  await Promise.allSettled(
    openTabs.map(async (tab) => {
      if (!tab.id || !FocusDomain.isTrackableUrl(tab.url)) {
        return;
      }

      const domain = FocusDomain.normalizeSite(tab.url);
      const blockedEntry = [...blockedDomains.entries()].find(([ruleDomain]) =>
        FocusDomain.domainMatches(domain, ruleDomain)
      );

      if (blockedEntry) {
        const [ruleDomain, reason] = blockedEntry;
        await chrome.tabs.update(tab.id, {
          url: blockedPageUrl(ruleDomain, reason)
        });
      }
    })
  );
}

async function updateBadge(tabId, domain, stats, settings, runtimeState) {
  const manuallyBlocked = matchesAnyRule(domain, settings.blockedSites);
  const limitBlocked = matchesAnyRule(domain, runtimeState.temporaryBlocks);
  const limit = findMatchingLimit(domain, settings.dailyLimits);

  let text = "";
  let color = "#315efb";

  if (manuallyBlocked || limitBlocked) {
    text = "BLOCK";
    color = "#d43a47";
  } else if (limit) {
    const usedMs = totalUsageForDomain(stats, limit.domain);
    const percent = Math.floor((usedMs / (limit.minutes * 60000)) * 100);

    if (percent >= settings.warningPercent) {
      text = `${Math.min(99, percent)}%`;
      color = "#df8b18";
    }
  }

  await Promise.all([
    chrome.action.setBadgeText({ tabId, text }),
    chrome.action.setBadgeBackgroundColor({ tabId, color })
  ]);
}

async function validateActiveTab(tab, idleThresholdSeconds) {
  if (!tab?.id || !tab.active || !FocusDomain.isTrackableUrl(tab.url)) {
    return null;
  }

  const [currentTab, browserWindow, idleState] = await Promise.all([
    chrome.tabs.get(tab.id),
    chrome.windows.get(tab.windowId),
    chrome.idle.queryState(idleThresholdSeconds)
  ]);

  if (
    !currentTab.active ||
    !browserWindow.focused ||
    idleState !== "active" ||
    !FocusDomain.isTrackableUrl(currentTab.url)
  ) {
    return null;
  }

  return {
    domain: FocusDomain.normalizeSite(currentTab.url),
    tab: currentTab
  };
}

async function recordActivityPulse(sender) {
  const dayCheck = await FocusStorage.ensureCurrentDay();
  if (dayCheck.changed) {
    clearActivitySessions();
    await rebuildBlockingRules();
  }

  const tab = sender.tab;
  const settings = await FocusStorage.getSettings();
  const activePage = await validateActiveTab(tab, settings.idleThresholdSeconds);

  if (!activePage) {
    if (tab?.id) {
      activitySessions.delete(tab.id);
    }
    return { recordedMs: 0 };
  }

  const now = Date.now();
  const previous = activitySessions.get(activePage.tab.id);
  activitySessions.set(activePage.tab.id, {
    domain: activePage.domain,
    timestamp: now
  });

  if (!previous || previous.domain !== activePage.domain) {
    const [stats, runtimeState] = await Promise.all([
      FocusStorage.getStats(),
      FocusStorage.getRuntimeState()
    ]);
    await updateBadge(
      activePage.tab.id,
      activePage.domain,
      stats,
      settings,
      runtimeState
    );
    return { domain: activePage.domain, recordedMs: 0 };
  }

  const elapsedMs = now - previous.timestamp;
  const incrementMs = Math.min(MAX_INCREMENT_MS, Math.max(0, elapsedMs));

  if (incrementMs > 0) {
    const stats = await FocusStorage.addActiveTime(
      activePage.domain,
      incrementMs
    );
    const limit = findMatchingLimit(activePage.domain, settings.dailyLimits);
    let runtimeState = await FocusStorage.getRuntimeState();

    if (limit) {
      const usedMs = totalUsageForDomain(stats, limit.domain);
      const limitMs = limit.minutes * 60000;

      if (
        usedMs >= limitMs &&
        !runtimeState.temporaryBlocks.includes(limit.domain)
      ) {
        runtimeState = await FocusStorage.addTemporaryBlock(limit.domain);
        await rebuildBlockingRules();
        await updateBadge(
          activePage.tab.id,
          activePage.domain,
          stats,
          settings,
          runtimeState
        );
        await chrome.tabs.update(activePage.tab.id, {
          url: blockedPageUrl(limit.domain, "limit")
        });

        return {
          blocked: true,
          domain: activePage.domain,
          recordedMs: incrementMs
        };
      }
    }

    await updateBadge(
      activePage.tab.id,
      activePage.domain,
      stats,
      settings,
      runtimeState
    );
  }

  return {
    domain: activePage.domain,
    recordedMs: incrementMs
  };
}

async function initializeExtension() {
  await FocusStorage.ensureCurrentDay();
  await rebuildBlockingRules();
  await chrome.alarms.create("daily-state-check", { periodInMinutes: 30 });
}

function ensureInitialized() {
  if (!initializationPromise) {
    initializationPromise = initializeExtension().catch((error) => {
      initializationPromise = null;
      throw error;
    });
  }

  return initializationPromise;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "ACTIVITY_PULSE") {
    queueStorageWork(() => recordActivityPulse(sender))
      .then(sendResponse)
      .catch((error) => {
        console.error("Could not record activity.", error);
        sendResponse({ error: error.message });
      });

    return true;
  }

  if (message?.type === "SETTINGS_UPDATED") {
    clearActivitySessions();
    queueStorageWork(rebuildBlockingRules)
      .then(() => sendResponse({ updated: true }))
      .catch((error) => sendResponse({ error: error.message }));

    return true;
  }

  if (message?.type === "CHECK_DAY") {
    queueStorageWork(async () => {
      const result = await FocusStorage.ensureCurrentDay();
      if (result.changed) {
        await rebuildBlockingRules();
      }
      return result;
    })
      .then(sendResponse)
      .catch((error) => sendResponse({ error: error.message }));

    return true;
  }

  return false;
});

chrome.runtime.onInstalled.addListener(() => {
  ensureInitialized().catch(console.error);
});

chrome.runtime.onStartup.addListener(() => {
  ensureInitialized().catch(console.error);
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "daily-state-check") {
    queueStorageWork(async () => {
      const result = await FocusStorage.ensureCurrentDay();
      if (result.changed) {
        clearActivitySessions();
        await rebuildBlockingRules();
      }
    }).catch(console.error);
  }
});

chrome.tabs.onActivated.addListener(clearActivitySessions);
chrome.tabs.onRemoved.addListener((tabId) => activitySessions.delete(tabId));
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url) {
    activitySessions.delete(tabId);
  }
});
chrome.windows.onFocusChanged.addListener(clearActivitySessions);
chrome.idle.onStateChanged.addListener(clearActivitySessions);

ensureInitialized().catch(console.error);
