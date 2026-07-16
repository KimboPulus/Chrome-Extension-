import {
  calculateFocusScore,
  formatDuration,
  resolveCategory,
  totalActiveMs,
} from "../domain/analytics";
import { findMatchingLimit, totalUsageForRule } from "../domain/policies";
import type { DashboardData, DailyUsage } from "../domain/types";
import { requiredElement, sendMessage, showStatus } from "./shared";

const totalTime = requiredElement<HTMLElement>("#total-time");
const focusScore = requiredElement<HTMLElement>("#focus-score");
const siteCount = requiredElement<HTMLElement>("#site-count");
const usageList = requiredElement<HTMLElement>("#usage-list");
const emptyState = requiredElement<HTMLElement>("#empty-state");
const sessionStatus = requiredElement<HTMLElement>("#session-status");
const popupStatus = requiredElement<HTMLElement>("#popup-status");

function renderUsage(usage: DailyUsage, dashboard: DashboardData): void {
  usageList.replaceChildren();
  const entries = Object.entries(usage).sort(
    ([, left], [, right]) => right.activeMs - left.activeMs,
  );
  const maxMs = entries[0]?.[1].activeMs ?? 1;
  siteCount.textContent = `${entries.length} ${entries.length === 1 ? "site" : "sites"}`;
  emptyState.hidden = entries.length > 0;

  for (const [domain, entry] of entries.slice(0, 5)) {
    const row = document.createElement("article");
    const topline = document.createElement("div");
    const domainLabel = document.createElement("span");
    const time = document.createElement("span");
    const meta = document.createElement("div");
    const category = document.createElement("span");
    const budget = document.createElement("span");
    const progress = document.createElement("div");
    const progressBar = document.createElement("div");
    const siteCategory = resolveCategory(domain, dashboard.settings.categories);
    const limit = findMatchingLimit(domain, dashboard.settings.dailyLimits);

    row.className = "usage-row";
    topline.className = "usage-topline";
    domainLabel.className = "usage-domain";
    domainLabel.textContent = domain;
    time.className = "usage-time";
    time.textContent = formatDuration(entry.activeMs);
    meta.className = "usage-meta";
    category.className = `category-${siteCategory}`;
    category.textContent = siteCategory;
    budget.textContent = limit
      ? `${Math.floor(
          (totalUsageForRule(usage, limit.domain) / (limit.minutes * 60_000)) *
            100,
        )}% of ${limit.minutes}m budget`
      : `${entry.sessionCount} ${entry.sessionCount === 1 ? "session" : "sessions"}`;
    progress.className = "progress-track";
    progressBar.className = "progress-bar";
    progressBar.style.width = `${Math.max(2, (entry.activeMs / maxMs) * 100)}%`;

    if (limit) {
      const percent =
        (totalUsageForRule(usage, limit.domain) / (limit.minutes * 60_000)) *
        100;
      progressBar.classList.toggle(
        "warning",
        percent >= dashboard.settings.warningPercent,
      );
      progressBar.classList.toggle("blocked", percent >= 100);
    }

    topline.append(domainLabel, time);
    meta.append(category, budget);
    progress.append(progressBar);
    row.append(topline, meta, progress);
    usageList.append(row);
  }
}

async function render(): Promise<void> {
  try {
    const dashboard = await sendMessage<DashboardData>({
      days: 1,
      type: "GET_DASHBOARD",
    });
    const usage = dashboard.days.at(-1)?.usage ?? {};
    const score = calculateFocusScore(usage, dashboard.settings.categories);
    totalTime.textContent = formatDuration(totalActiveMs(usage));
    focusScore.textContent = score === null ? "—" : `${score}`;
    renderUsage(usage, dashboard);

    const session = dashboard.runtime.activeFocusSession;
    if (session && session.endsAt > Date.now()) {
      sessionStatus.hidden = false;
      sessionStatus.textContent = `Deep focus until ${new Date(
        session.endsAt,
      ).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })}`;
    } else {
      sessionStatus.hidden = true;
    }
  } catch (error) {
    showStatus(
      popupStatus,
      error instanceof Error ? error.message : "Could not load dashboard.",
      true,
    );
  }
}

requiredElement<HTMLButtonElement>("#open-options").addEventListener(
  "click",
  () => {
    void chrome.runtime.openOptionsPage();
  },
);

requiredElement<HTMLButtonElement>("#open-dashboard").addEventListener(
  "click",
  () => {
    void (async () => {
      try {
        const currentWindow = await chrome.windows.getCurrent();
        if (currentWindow.id === undefined) {
          throw new Error("Current Chrome window is unavailable.");
        }
        await chrome.sidePanel.open({ windowId: currentWindow.id });
        window.close();
      } catch (error) {
        showStatus(
          popupStatus,
          error instanceof Error ? error.message : "Could not open dashboard.",
          true,
        );
      }
    })();
  },
);

void render();
