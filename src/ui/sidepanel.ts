import {
  calculateFocusScore,
  formatDuration,
  resolveCategory,
  totalActiveMs,
} from "../domain/analytics";
import type { DashboardData, DailyUsage } from "../domain/types";
import { requiredElement, sendMessage, showStatus } from "./shared";

const totalTime = requiredElement<HTMLElement>("#total-time");
const focusScore = requiredElement<HTMLElement>("#focus-score");
const siteCount = requiredElement<HTMLElement>("#site-count");
const usageList = requiredElement<HTMLElement>("#usage-list");
const emptyState = requiredElement<HTMLElement>("#empty-state");
const weekChart = requiredElement<HTMLElement>("#week-chart");
const sessionStatus = requiredElement<HTMLElement>("#session-status");
const sessionMinutes = requiredElement<HTMLInputElement>("#session-minutes");
const startSession = requiredElement<HTMLButtonElement>("#start-session");
const stopSession = requiredElement<HTMLButtonElement>("#stop-session");
const dashboardStatus = requiredElement<HTMLElement>("#dashboard-status");

function renderUsage(usage: DailyUsage, dashboard: DashboardData): void {
  usageList.replaceChildren();
  const entries = Object.entries(usage).sort(
    ([, left], [, right]) => right.activeMs - left.activeMs,
  );
  siteCount.textContent = `${entries.length} ${entries.length === 1 ? "site" : "sites"}`;
  emptyState.hidden = entries.length > 0;

  for (const [domain, entry] of entries.slice(0, 12)) {
    const row = document.createElement("article");
    const top = document.createElement("div");
    const domainLabel = document.createElement("span");
    const time = document.createElement("span");
    const meta = document.createElement("div");
    const categoryLabel = document.createElement("span");
    const modeBreakdown = document.createElement("span");
    const category = resolveCategory(domain, dashboard.settings.categories);

    row.className = "usage-row";
    top.className = "usage-topline";
    domainLabel.className = "usage-domain";
    domainLabel.textContent = domain;
    time.className = "usage-time";
    time.textContent = formatDuration(entry.activeMs);
    meta.className = "usage-meta";
    categoryLabel.className = `category-${category}`;
    categoryLabel.textContent = category;
    modeBreakdown.textContent = `${formatDuration(entry.interactionMs)} active · ${formatDuration(
      entry.mediaMs,
    )} media`;
    top.append(domainLabel, time);
    meta.append(categoryLabel, modeBreakdown);
    row.append(top, meta);
    usageList.append(row);
  }
}

function renderChart(dashboard: DashboardData): void {
  weekChart.replaceChildren();
  const totals = dashboard.days.map((day) => totalActiveMs(day.usage));
  const maximum = Math.max(...totals, 1);

  dashboard.days.forEach((day, index) => {
    const column = document.createElement("div");
    const track = document.createElement("div");
    const fill = document.createElement("div");
    const label = document.createElement("span");
    const total = totals[index] ?? 0;
    const date = new Date(`${day.date}T12:00:00`);

    column.className = "day-bar";
    column.title = `${date.toLocaleDateString()} — ${formatDuration(total)}`;
    track.className = "bar-track";
    fill.className = "bar-fill";
    fill.style.height = `${Math.max(2, (total / maximum) * 100)}%`;
    label.textContent = date
      .toLocaleDateString([], { weekday: "short" })
      .slice(0, 2);
    track.append(fill);
    column.append(track, label);
    weekChart.append(column);
  });
}

function renderSession(dashboard: DashboardData): void {
  const session = dashboard.runtime.activeFocusSession;
  const active = Boolean(session && session.endsAt > Date.now());
  startSession.hidden = active;
  stopSession.hidden = !active;
  sessionMinutes.disabled = active;
  sessionStatus.textContent =
    active && session
      ? `Active until ${new Date(session.endsAt).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })}. ${session.blockedSites.length} sites blocked.`
      : "Blocks distracting and scheduled sites.";
}

async function render(): Promise<void> {
  try {
    const dashboard = await sendMessage<DashboardData>({
      days: 7,
      type: "GET_DASHBOARD",
    });
    const usage = dashboard.days.at(-1)?.usage ?? {};
    const score = calculateFocusScore(usage, dashboard.settings.categories);
    totalTime.textContent = formatDuration(totalActiveMs(usage));
    focusScore.textContent = score === null ? "—" : `${score}`;
    renderChart(dashboard);
    renderUsage(usage, dashboard);
    renderSession(dashboard);
    showStatus(dashboardStatus, "");
  } catch (error) {
    showStatus(
      dashboardStatus,
      error instanceof Error ? error.message : "Could not load dashboard.",
      true,
    );
  }
}

startSession.addEventListener("click", () => {
  void (async () => {
    try {
      await sendMessage({
        minutes: Number(sessionMinutes.value),
        type: "START_FOCUS_SESSION",
      });
      await render();
      showStatus(dashboardStatus, "Focus session started.");
    } catch (error) {
      showStatus(
        dashboardStatus,
        error instanceof Error
          ? error.message
          : "Could not start focus session.",
        true,
      );
    }
  })();
});

stopSession.addEventListener("click", () => {
  void (async () => {
    try {
      await sendMessage({ type: "STOP_FOCUS_SESSION" });
      await render();
      showStatus(dashboardStatus, "Focus session stopped.");
    } catch (error) {
      showStatus(
        dashboardStatus,
        error instanceof Error
          ? error.message
          : "Could not stop focus session.",
        true,
      );
    }
  })();
});

requiredElement<HTMLButtonElement>("#open-options").addEventListener(
  "click",
  () => {
    void chrome.runtime.openOptionsPage();
  },
);

window.setInterval(() => void render(), 15_000);
void render();
