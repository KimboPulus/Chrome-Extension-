"use strict";

const limitsList = document.getElementById("limits-list");
const limitRowTemplate = document.getElementById("limit-row-template");
const settingsForm = document.getElementById("settings-form");
const blockedSitesInput = document.getElementById("blocked-sites");
const idleThresholdInput = document.getElementById("idle-threshold");
const saveStatus = document.getElementById("save-status");

function addLimitRow(domain = "", minutes = 30) {
  const row = limitRowTemplate.content.firstElementChild.cloneNode(true);
  row.querySelector(".limit-domain").value = domain;
  row.querySelector(".limit-minutes").value = minutes;
  row.querySelector(".remove-limit").addEventListener("click", () => row.remove());
  limitsList.append(row);
}

document.getElementById("add-limit").addEventListener("click", () => addLimitRow());

function showStatus(message, isError = false) {
  saveStatus.textContent = message;
  saveStatus.classList.toggle("error", isError);
}

function parseBlockedSites() {
  const sites = [];

  for (const line of blockedSitesInput.value.split(/\r?\n/)) {
    const input = line.trim();
    if (!input) {
      continue;
    }

    const domain = FocusDomain.normalizeSite(input);
    if (!domain) {
      throw new Error(`"${input}" is not a valid website.`);
    }

    sites.push(domain);
  }

  return [...new Set(sites)];
}

function parseDailyLimits() {
  const limits = {};

  for (const row of limitsList.querySelectorAll(".limit-row")) {
    const rawDomain = row.querySelector(".limit-domain").value.trim();
    const rawMinutes = row.querySelector(".limit-minutes").value;

    if (!rawDomain) {
      continue;
    }

    const domain = FocusDomain.normalizeSite(rawDomain);
    const minutes = Number(rawMinutes);

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

async function loadSettings() {
  const settings = await FocusStorage.getSettings();

  blockedSitesInput.value = settings.blockedSites.join("\n");
  idleThresholdInput.value = settings.idleThresholdSeconds;
  limitsList.replaceChildren();

  const entries = Object.entries(settings.dailyLimits);
  if (entries.length === 0) {
    addLimitRow();
    return;
  }

  for (const [domain, minutes] of entries) {
    addLimitRow(domain, minutes);
  }
}

settingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  showStatus("");
  const saveButton = settingsForm.querySelector('button[type="submit"]');
  saveButton.disabled = true;

  try {
    const idleThresholdSeconds = Number(idleThresholdInput.value);
    if (
      !Number.isFinite(idleThresholdSeconds) ||
      idleThresholdSeconds < 15 ||
      idleThresholdSeconds > 900
    ) {
      throw new Error("Idle threshold must be between 15 and 900 seconds.");
    }

    await FocusStorage.saveSettings({
      blockedSites: parseBlockedSites(),
      dailyLimits: parseDailyLimits(),
      idleThresholdSeconds
    });

    await chrome.runtime
      .sendMessage({ type: "SETTINGS_UPDATED" })
      .catch(() => undefined);

    showStatus("Settings saved.");
  } catch (error) {
    showStatus(error.message, true);
  } finally {
    saveButton.disabled = false;
  }
});

loadSettings().catch((error) => {
  console.error(error);
  showStatus("Could not load settings.", true);
});
