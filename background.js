"use strict";

importScripts("lib/domain.js", "lib/storage.js");

const MAX_INCREMENT_MS = 10000;
const activitySessions = new Map();
let storageQueue = Promise.resolve();

function queueStorageWork(task) {
  storageQueue = storageQueue.then(task, task);
  return storageQueue;
}

function clearActivitySessions() {
  activitySessions.clear();
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
    return { domain: activePage.domain, recordedMs: 0 };
  }

  const elapsedMs = now - previous.timestamp;
  const incrementMs = Math.min(MAX_INCREMENT_MS, Math.max(0, elapsedMs));

  if (incrementMs > 0) {
    await FocusStorage.ensureCurrentDay();
    await FocusStorage.addActiveTime(activePage.domain, incrementMs);
  }

  return {
    domain: activePage.domain,
    recordedMs: incrementMs
  };
}

async function initializeExtension() {
  await FocusStorage.ensureCurrentDay();
  await chrome.alarms.create("daily-state-check", { periodInMinutes: 30 });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "ACTIVITY_PULSE") {
    return false;
  }

  queueStorageWork(() => recordActivityPulse(sender))
    .then(sendResponse)
    .catch((error) => {
      console.error("Could not record activity.", error);
      sendResponse({ error: error.message });
    });

  return true;
});

chrome.runtime.onInstalled.addListener(() => {
  initializeExtension().catch(console.error);
});

chrome.runtime.onStartup.addListener(() => {
  initializeExtension().catch(console.error);
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "daily-state-check") {
    queueStorageWork(() => FocusStorage.ensureCurrentDay()).catch(console.error);
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

initializeExtension().catch(console.error);
