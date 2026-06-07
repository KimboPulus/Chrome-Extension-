"use strict";

const usageList = document.getElementById("usage-list");
const totalTime = document.getElementById("total-time");
const siteCount = document.getElementById("site-count");

function formatDuration(milliseconds) {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const totalMinutes = Math.floor(milliseconds / 60000);

  if (totalMinutes < 1) {
    return totalSeconds < 1 ? "<1 sec" : `${totalSeconds} sec`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes} min`;
}

function matchingLimit(domain, dailyLimits) {
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

function buildUsageRow(domain, data, settings, runtimeState) {
  const row = document.createElement("article");
  const limit = matchingLimit(domain, settings.dailyLimits);
  const manuallyBlocked = matchesAnyRule(domain, settings.blockedSites);
  const limitBlocked = matchesAnyRule(domain, runtimeState.temporaryBlocks);
  const blocked = manuallyBlocked || limitBlocked;
  const limitMs = limit ? limit.minutes * 60000 : 0;
  const percent = limitMs ? Math.min(100, (data.activeMs / limitMs) * 100) : 0;

  row.className = "usage-row";
  row.innerHTML = `
    <div class="usage-topline">
      <span class="usage-domain"></span>
      <span class="usage-time"></span>
    </div>
    <div class="usage-meta">
      <span class="usage-limit"></span>
      <span class="usage-status"></span>
    </div>
  `;

  row.querySelector(".usage-domain").textContent = domain;
  row.querySelector(".usage-time").textContent = formatDuration(data.activeMs);
  row.querySelector(".usage-limit").textContent = limit
    ? `${limit.minutes} min daily limit`
    : "No daily limit";

  const status = row.querySelector(".usage-status");
  if (blocked) {
    status.textContent = "Blocked";
    status.classList.add("blocked");
  } else if (limit && percent >= settings.warningPercent) {
    status.textContent = `${Math.round(percent)}% used`;
  }

  if (limit) {
    const track = document.createElement("div");
    const bar = document.createElement("div");

    track.className = "progress-track";
    bar.className = "progress-bar";
    bar.style.width = `${percent}%`;

    if (blocked) {
      bar.classList.add("blocked");
    } else if (percent >= settings.warningPercent) {
      bar.classList.add("warning");
    }

    track.append(bar);
    row.append(track);
  }

  return row;
}

async function renderPopup() {
  await chrome.runtime.sendMessage({ type: "CHECK_DAY" });

  const [stats, settings, runtimeState] = await Promise.all([
    FocusStorage.getStats(),
    FocusStorage.getSettings(),
    FocusStorage.getRuntimeState()
  ]);

  const entries = Object.entries(stats)
    .filter(([, data]) => Number(data.activeMs) > 0)
    .sort(([, left], [, right]) => right.activeMs - left.activeMs);
  const visibleEntries = entries.slice(0, 5);

  const totalMs = entries.reduce((sum, [, data]) => sum + data.activeMs, 0);
  totalTime.textContent = formatDuration(totalMs);
  siteCount.textContent = String(visibleEntries.length);
  usageList.replaceChildren();

  if (entries.length === 0) {
    const emptyState = document.createElement("p");
    emptyState.className = "empty-state";
    emptyState.textContent = "No activity recorded yet.";
    usageList.append(emptyState);
    return;
  }

  for (const [domain, data] of visibleEntries) {
    usageList.append(buildUsageRow(domain, data, settings, runtimeState));
  }
}

document.getElementById("open-options").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

renderPopup().catch((error) => {
  console.error(error);
  usageList.innerHTML = '<p class="empty-state">Could not load today\'s activity.</p>';
});
