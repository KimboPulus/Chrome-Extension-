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
  return FocusSettings.parseBlockedSites(
    blockedSitesInput.value,
    FocusDomain.normalizeSite
  );
}

function parseDailyLimits() {
  const rows = [...limitsList.querySelectorAll(".limit-row")].map((row) => ({
    domain: row.querySelector(".limit-domain").value,
    minutes: row.querySelector(".limit-minutes").value
  }));

  return FocusSettings.parseDailyLimits(rows, FocusDomain.normalizeSite);
}

function populateSettings(settings) {
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

async function loadSettings() {
  const settings = await FocusStorage.getSettings();
  populateSettings(settings);
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

    const response = await chrome.runtime.sendMessage({
      type: "SAVE_SETTINGS",
      settings: {
        blockedSites: parseBlockedSites(),
        dailyLimits: parseDailyLimits(),
        idleThresholdSeconds
      }
    });

    if (!response || response.error) {
      throw new Error(response?.error || "The background worker did not respond.");
    }

    populateSettings(response.settings);
    const ruleLabel =
      response.blockingRuleCount === 1 ? "blocking rule" : "blocking rules";
    showStatus(
      `Settings saved. ${response.blockingRuleCount} active ${ruleLabel}.`
    );
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
