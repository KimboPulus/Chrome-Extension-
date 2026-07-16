import { FocusService } from "../../application/focus-service";
import { usageToCsv } from "../../domain/analytics";
import { isTrackableUrl, normalizeSite } from "../../domain/domain";
import {
  blockReasonForDomain,
  collectBlockedDomains,
  findMatchingLimit,
  totalUsageForRule,
} from "../../domain/policies";
import {
  canCountIdleState,
  canCountWindowState,
  resolvePulseMode,
} from "../../domain/tracking";
import type {
  ActivityMode,
  BlockReason,
  DailyUsage,
  RuntimeState,
  Settings,
} from "../../domain/types";
import { FocusRepository } from "../../storage/repository";

const STATE_ALARM = "focus-meter-state-check";
const SESSION_ALARM = "focus-meter-session-end";
const repository = new FocusRepository(
  chrome.storage.local,
  chrome.storage.session,
);
const focusService = new FocusService(repository);

let initializationPromise: Promise<void> | null = null;
let workQueue = Promise.resolve();

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const result = workQueue.then(task, task);
  workQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

async function restrictStorageAccess(): Promise<void> {
  await Promise.all([
    chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" }),
    chrome.storage.session.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" }),
  ]);
}

async function initializeExtension(): Promise<void> {
  await restrictStorageAccess();
  await focusService.initialize();
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
  await chrome.alarms.create(STATE_ALARM, { periodInMinutes: 1 });
  await rebuildBlockingRules();
}

function ensureInitialized(): Promise<void> {
  if (!initializationPromise) {
    initializationPromise = initializeExtension().catch((error: unknown) => {
      initializationPromise = null;
      throw error;
    });
  }
  return initializationPromise;
}

function blockedPageUrl(domain: string, reason: BlockReason): string {
  const url = new URL(chrome.runtime.getURL("blocked/blocked.html"));
  url.searchParams.set("domain", domain);
  url.searchParams.set("reason", reason);
  return url.toString();
}

function sameStrings(left: string[], right: string[]): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

async function currentPolicyState(now = new Date()): Promise<{
  blocked: Map<string, BlockReason>;
  runtime: RuntimeState;
  settings: Settings;
  usage: DailyUsage;
}> {
  const [settings, storedRuntime, usage] = await Promise.all([
    repository.getSettings(),
    repository.getRuntimeState(),
    repository.getUsage(),
  ]);
  const reachedLimits = Object.entries(settings.dailyLimits)
    .filter(
      ([domain, minutes]) =>
        totalUsageForRule(usage, domain) >= minutes * 60_000,
    )
    .map(([domain]) => domain)
    .sort();
  const activeFocusSession =
    storedRuntime.activeFocusSession &&
    storedRuntime.activeFocusSession.endsAt > now.getTime()
      ? storedRuntime.activeFocusSession
      : null;
  const runtime =
    sameStrings(reachedLimits, [...storedRuntime.temporaryBlocks].sort()) &&
    activeFocusSession === storedRuntime.activeFocusSession
      ? storedRuntime
      : await repository.saveRuntimeState({
          ...storedRuntime,
          activeFocusSession,
          temporaryBlocks: reachedLimits,
        });

  return {
    blocked: collectBlockedDomains(settings, runtime, usage, now),
    runtime,
    settings,
    usage,
  };
}

async function rebuildBlockingRules(now = new Date()): Promise<void> {
  const [{ blocked }, currentRules] = await Promise.all([
    currentPolicyState(now),
    chrome.declarativeNetRequest.getDynamicRules(),
  ]);
  const addRules: chrome.declarativeNetRequest.Rule[] = [...blocked.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([domain, reason], index) => ({
      action: {
        redirect: { url: blockedPageUrl(domain, reason) },
        type: chrome.declarativeNetRequest.RuleActionType.REDIRECT,
      },
      condition: {
        requestDomains: [domain],
        resourceTypes: [chrome.declarativeNetRequest.ResourceType.MAIN_FRAME],
      },
      id: index + 1,
      priority: 1,
    }));

  await chrome.declarativeNetRequest.updateDynamicRules({
    addRules,
    removeRuleIds: currentRules.map((rule) => rule.id),
  });

  const tabs = await chrome.tabs.query({});
  await Promise.allSettled(
    tabs.map(async (tab) => {
      if (!tab.id || !isTrackableUrl(tab.url)) {
        return;
      }
      const domain = normalizeSite(tab.url);
      const block = blockReasonForDomain(domain, blocked);
      if (block) {
        await chrome.tabs.update(tab.id, {
          url: blockedPageUrl(block.domain, block.reason),
        });
      }
    }),
  );
}

async function updateBadge(
  tabId: number,
  domain: string,
  policy?: Awaited<ReturnType<typeof currentPolicyState>>,
): Promise<void> {
  const current = policy ?? (await currentPolicyState());
  const block = blockReasonForDomain(domain, current.blocked);
  const limit = findMatchingLimit(domain, current.settings.dailyLimits);
  let text = "";
  let color = "#315efb";

  if (block) {
    text = "BLOCK";
    color = "#d43a47";
  } else if (limit) {
    const usedMs = totalUsageForRule(current.usage, limit.domain);
    const percent = Math.floor((usedMs / (limit.minutes * 60_000)) * 100);
    if (percent >= current.settings.warningPercent) {
      text = `${Math.min(99, percent)}%`;
      color = "#df8b18";
    }
  }

  await Promise.all([
    chrome.action.setBadgeText({ tabId, text }),
    chrome.action.setBadgeBackgroundColor({ color, tabId }),
  ]);
}

interface ActivePage {
  domain: string;
  mode: ActivityMode;
  tab: chrome.tabs.Tab;
}

async function validateActivePage(
  senderTab: chrome.tabs.Tab | undefined,
  requestedMode: unknown,
  settings: Settings,
): Promise<ActivePage | null> {
  if (!senderTab?.id || !senderTab.active || !isTrackableUrl(senderTab.url)) {
    return null;
  }

  const tab = await chrome.tabs.get(senderTab.id);
  const [window, idleState] = await Promise.all([
    chrome.windows.get(tab.windowId),
    chrome.idle.queryState(settings.idleThresholdSeconds),
  ]);
  const mode = resolvePulseMode(requestedMode, tab.audible === true);

  if (
    !tab.active ||
    !mode ||
    !isTrackableUrl(tab.url) ||
    !canCountWindowState(mode, window.focused) ||
    !canCountIdleState(mode, idleState)
  ) {
    return null;
  }

  return { domain: normalizeSite(tab.url), mode, tab };
}

async function recordActivityPulse(
  sender: chrome.runtime.MessageSender,
  requestedMode: unknown,
): Promise<Record<string, unknown>> {
  const day = await repository.ensureCurrentDay();
  if (day.changed) {
    await focusService.reset();
    await rebuildBlockingRules();
  }

  const settings = await repository.getSettings();
  if (!settings.trackingEnabled) {
    await focusService.reset();
    return { recordedMs: 0 };
  }

  const activePage = await validateActivePage(
    sender.tab,
    requestedMode,
    settings,
  );
  if (!activePage?.tab.id) {
    await focusService.reset();
    return { recordedMs: 0 };
  }

  const result = await focusService.process({
    at: Date.now(),
    domain: activePage.domain,
    mode: activePage.mode,
    tabId: activePage.tab.id,
    type: "ACTIVITY_PULSE",
    windowId: activePage.tab.windowId,
  });
  const policy = await currentPolicyState();
  const limit = findMatchingLimit(activePage.domain, settings.dailyLimits);
  const reachedLimit =
    limit !== null &&
    totalUsageForRule(policy.usage, limit.domain) >= limit.minutes * 60_000;

  if (reachedLimit) {
    await rebuildBlockingRules();
    await updateBadge(activePage.tab.id, activePage.domain, policy);
    await chrome.tabs.update(activePage.tab.id, {
      url: blockedPageUrl(limit.domain, "limit"),
    });
    return {
      blocked: true,
      domain: activePage.domain,
      recordedMs: result.recordedMs,
    };
  }

  await updateBadge(activePage.tab.id, activePage.domain, policy);
  return { domain: activePage.domain, recordedMs: result.recordedMs };
}

async function dashboard(days = 7) {
  const [settings, runtime, usageDays, bytesInUse] = await Promise.all([
    repository.getSettings(),
    repository.getRuntimeState(),
    repository.getUsageRange(days),
    repository.bytesInUse(),
  ]);
  return { bytesInUse, days: usageDays, runtime, settings };
}

async function startFocusSession(minutesValue: unknown): Promise<RuntimeState> {
  const minutes = Math.min(
    240,
    Math.max(5, Math.round(Number(minutesValue) || 25)),
  );
  const [settings, runtime] = await Promise.all([
    repository.getSettings(),
    repository.getRuntimeState(),
  ]);
  const distractingSites = Object.entries(settings.categories)
    .filter(([, category]) => category === "distracting")
    .map(([domain]) => domain);
  const blockedSites = [
    ...new Set([...settings.focusSchedule.blockedSites, ...distractingSites]),
  ].sort();

  if (blockedSites.length === 0) {
    throw new Error(
      "Add distracting categories or scheduled blocked sites first.",
    );
  }

  const startedAt = Date.now();
  const endsAt = startedAt + minutes * 60_000;
  const next = await repository.saveRuntimeState({
    ...runtime,
    activeFocusSession: { blockedSites, endsAt, startedAt },
  });
  await chrome.alarms.create(SESSION_ALARM, { when: endsAt });
  await rebuildBlockingRules();
  return next;
}

async function stopFocusSession(): Promise<RuntimeState> {
  const runtime = await repository.getRuntimeState();
  const next = await repository.saveRuntimeState({
    ...runtime,
    activeFocusSession: null,
  });
  await chrome.alarms.clear(SESSION_ALARM);
  await rebuildBlockingRules();
  return next;
}

async function runStateCheck(): Promise<void> {
  const now = new Date();
  const day = await repository.ensureCurrentDay(now);
  const settings = await repository.getSettings();
  await focusService.process({ at: now.getTime(), type: "CHECKPOINT" });
  if (day.changed) {
    await repository.pruneHistory(settings.retentionDays, now);
  }
  await rebuildBlockingRules(now);
}

async function handleMessage(
  rawMessage: unknown,
  sender: chrome.runtime.MessageSender,
): Promise<unknown> {
  await ensureInitialized();
  const message = asRecord(rawMessage);
  const extensionPage =
    sender.url?.startsWith(chrome.runtime.getURL("")) === true;
  if (sender.id !== chrome.runtime.id) {
    throw new Error("Message sender is not trusted.");
  }
  if (message.type !== "ACTIVITY_PULSE" && !extensionPage) {
    throw new Error("This request is limited to Focus Meter pages.");
  }

  switch (message.type) {
    case "ACTIVITY_PULSE":
      return recordActivityPulse(sender, message.mode);
    case "SAVE_SETTINGS": {
      const settings = await repository.saveSettings(message.settings);
      await focusService.reset();
      await repository.pruneHistory(settings.retentionDays);
      await rebuildBlockingRules();
      return { settings };
    }
    case "GET_DASHBOARD":
      return dashboard(Number(message.days) || 7);
    case "START_FOCUS_SESSION":
      return { runtime: await startFocusSession(message.minutes) };
    case "STOP_FOCUS_SESSION":
      return { runtime: await stopFocusSession() };
    case "EXPORT_DATA": {
      const data = await repository.exportData();
      if (message.format === "csv") {
        const days = Object.entries(data.usage)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([date, usage]) => ({ date, usage }));
        return {
          content: usageToCsv(days),
          filename: `focus-meter-${new Date().toISOString().slice(0, 10)}.csv`,
          mimeType: "text/csv",
        };
      }
      return {
        content: JSON.stringify(data, null, 2),
        filename: `focus-meter-backup-${new Date().toISOString().slice(0, 10)}.json`,
        mimeType: "application/json",
      };
    }
    case "IMPORT_DATA":
      await repository.importData(message.data);
      await focusService.initialize();
      await rebuildBlockingRules();
      return { imported: true };
    case "RESET_DATA":
      await repository.resetUsage();
      await repository.ensureCurrentDay();
      await focusService.reset();
      await rebuildBlockingRules();
      return { reset: true };
    case "CHECK_DAY":
      await runStateCheck();
      return { checked: true };
    default:
      throw new Error("Unsupported message type.");
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  enqueue(() => handleMessage(message, sender))
    .then((result) => sendResponse(result))
    .catch((error: unknown) => {
      console.error("Focus Meter request failed.", error);
      sendResponse({
        error: error instanceof Error ? error.message : "Unexpected error.",
      });
    });
  return true;
});

chrome.runtime.onInstalled.addListener(() => {
  void enqueue(ensureInitialized).catch(console.error);
});

chrome.runtime.onStartup.addListener(() => {
  void enqueue(ensureInitialized).catch(console.error);
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === STATE_ALARM) {
    void enqueue(async () => {
      await ensureInitialized();
      await runStateCheck();
    }).catch(console.error);
  } else if (alarm.name === SESSION_ALARM) {
    void enqueue(async () => {
      await ensureInitialized();
      await stopFocusSession();
    }).catch(console.error);
  }
});

chrome.tabs.onActivated.addListener(({ tabId, windowId }) => {
  void enqueue(async () => {
    await ensureInitialized();
    await focusService.process({
      at: Date.now(),
      tabId,
      type: "TAB_ACTIVATED",
      windowId,
    });
  }).catch(console.error);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void enqueue(async () => {
    await ensureInitialized();
    await focusService.process({ at: Date.now(), tabId, type: "TAB_REMOVED" });
  }).catch(console.error);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url) {
    void enqueue(async () => {
      await ensureInitialized();
      await focusService.process({
        at: Date.now(),
        tabId,
        type: "URL_CHANGED",
      });
    }).catch(console.error);
  }
});

chrome.windows.onFocusChanged.addListener((windowId) => {
  void enqueue(async () => {
    await ensureInitialized();
    await focusService.process({
      at: Date.now(),
      focusedWindowId:
        windowId === chrome.windows.WINDOW_ID_NONE ? null : windowId,
      type: "WINDOW_FOCUS_CHANGED",
    });
  }).catch(console.error);
});

chrome.idle.onStateChanged.addListener((state) => {
  void enqueue(async () => {
    await ensureInitialized();
    await focusService.process({
      at: Date.now(),
      state,
      type: "IDLE_STATE_CHANGED",
    });
  }).catch(console.error);
});

void enqueue(ensureInitialized).catch(console.error);
