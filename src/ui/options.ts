import { normalizeSite } from "../domain/domain";
import type { DashboardData, Settings, SiteCategory } from "../domain/types";
import {
  downloadText,
  requiredElement,
  sendMessage,
  showStatus,
} from "./shared";

const form = requiredElement<HTMLFormElement>("#settings-form");
const trackingEnabled = requiredElement<HTMLInputElement>("#tracking-enabled");
const idleThreshold = requiredElement<HTMLInputElement>("#idle-threshold");
const warningPercent = requiredElement<HTMLInputElement>("#warning-percent");
const retentionDays = requiredElement<HTMLInputElement>("#retention-days");
const blockedSites = requiredElement<HTMLTextAreaElement>("#blocked-sites");
const limitsList = requiredElement<HTMLElement>("#limits-list");
const limitsEmpty = requiredElement<HTMLElement>("#limits-empty");
const categoriesList = requiredElement<HTMLElement>("#categories-list");
const categoriesEmpty = requiredElement<HTMLElement>("#categories-empty");
const scheduleEnabled = requiredElement<HTMLInputElement>("#schedule-enabled");
const scheduleStart = requiredElement<HTMLInputElement>("#schedule-start");
const scheduleEnd = requiredElement<HTMLInputElement>("#schedule-end");
const scheduleSites = requiredElement<HTMLTextAreaElement>("#schedule-sites");
const storageUsage = requiredElement<HTMLElement>("#storage-usage");
const saveStatus = requiredElement<HTMLElement>("#save-status");
const importFile = requiredElement<HTMLInputElement>("#import-file");
let currentSettings: Settings | null = null;

function rowElement<T extends Element>(row: Element, selector: string): T {
  const element = row.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing row field: ${selector}`);
  }
  return element;
}

function cloneTemplate(selector: string): HTMLElement {
  const template = requiredElement<HTMLTemplateElement>(selector);
  const element = template.content.firstElementChild?.cloneNode(true);
  if (!(element instanceof HTMLElement)) {
    throw new Error(`Template ${selector} is empty.`);
  }
  return element;
}

function refreshEmptyStates(): void {
  limitsEmpty.hidden = limitsList.children.length > 0;
  categoriesEmpty.hidden = categoriesList.children.length > 0;
}

function addLimit(domain = "", minutes = 30): void {
  const row = cloneTemplate("#limit-row-template");
  rowElement<HTMLInputElement>(row, ".limit-domain").value = domain;
  rowElement<HTMLInputElement>(row, ".limit-minutes").value = String(minutes);
  rowElement<HTMLButtonElement>(row, ".remove-row").addEventListener(
    "click",
    () => {
      row.remove();
      refreshEmptyStates();
    },
  );
  limitsList.append(row);
  refreshEmptyStates();
}

function addCategory(domain = "", category: SiteCategory = "neutral"): void {
  const row = cloneTemplate("#category-row-template");
  rowElement<HTMLInputElement>(row, ".category-domain").value = domain;
  rowElement<HTMLSelectElement>(row, ".category-value").value = category;
  rowElement<HTMLButtonElement>(row, ".remove-row").addEventListener(
    "click",
    () => {
      row.remove();
      refreshEmptyStates();
    },
  );
  categoriesList.append(row);
  refreshEmptyStates();
}

function parseSiteText(text: string): string[] {
  const result: string[] = [];
  for (const rawValue of text.split(/[\s,;]+/)) {
    const value = rawValue.trim();
    if (!value) {
      continue;
    }
    const domain = normalizeSite(value);
    if (!domain) {
      throw new Error(`"${value}" is not a valid HTTP or HTTPS website.`);
    }
    result.push(domain);
  }
  return [...new Set(result)].sort();
}

function collectLimits(): Record<string, number> {
  const limits: Record<string, number> = {};
  for (const row of limitsList.querySelectorAll<HTMLElement>(".limit-row")) {
    const rawDomain = rowElement<HTMLInputElement>(
      row,
      ".limit-domain",
    ).value.trim();
    const domain = normalizeSite(rawDomain);
    const minutes = Number(
      rowElement<HTMLInputElement>(row, ".limit-minutes").value,
    );
    if (!domain) {
      throw new Error(`"${rawDomain}" is not a valid website.`);
    }
    if (!Number.isFinite(minutes) || minutes < 1 || minutes > 1440) {
      throw new Error(
        `Enter a daily budget from 1 to 1440 minutes for ${domain}.`,
      );
    }
    if (Object.hasOwn(limits, domain)) {
      throw new Error(`${domain} has more than one daily budget.`);
    }
    limits[domain] = Math.round(minutes);
  }
  return limits;
}

function collectCategories(): Record<string, SiteCategory> {
  const categories: Record<string, SiteCategory> = {};
  for (const row of categoriesList.querySelectorAll<HTMLElement>(
    ".category-row",
  )) {
    const rawDomain = rowElement<HTMLInputElement>(
      row,
      ".category-domain",
    ).value.trim();
    const domain = normalizeSite(rawDomain);
    const category = rowElement<HTMLSelectElement>(row, ".category-value")
      .value as SiteCategory;
    if (!domain) {
      throw new Error(`"${rawDomain}" is not a valid website.`);
    }
    if (Object.hasOwn(categories, domain)) {
      throw new Error(`${domain} has more than one category.`);
    }
    categories[domain] = category;
  }
  return categories;
}

function selectedScheduleDays(): number[] {
  return [
    ...document.querySelectorAll<HTMLInputElement>(
      'input[name="schedule-day"]',
    ),
  ]
    .filter((input) => input.checked)
    .map((input) => Number(input.value))
    .sort();
}

function readFormSettings(): Settings {
  if (!currentSettings) {
    throw new Error("Settings have not loaded yet.");
  }

  const idleMinutes = Number(idleThreshold.value);
  const retention = Number(retentionDays.value);
  const warning = Number(warningPercent.value);
  if (
    !Number.isFinite(idleMinutes) ||
    idleMinutes < 0.25 ||
    idleMinutes > 1440
  ) {
    throw new Error("Idle threshold must be between 0.25 and 1440 minutes.");
  }
  if (!Number.isFinite(retention) || retention < 1 || retention > 365) {
    throw new Error("Retention must be between 1 and 365 days.");
  }
  if (!Number.isFinite(warning) || warning < 1 || warning > 100) {
    throw new Error("Warning point must be between 1 and 100 percent.");
  }

  return {
    ...currentSettings,
    blockedSites: parseSiteText(blockedSites.value),
    categories: collectCategories(),
    dailyLimits: collectLimits(),
    focusSchedule: {
      blockedSites: parseSiteText(scheduleSites.value),
      days: selectedScheduleDays(),
      enabled: scheduleEnabled.checked,
      end: scheduleEnd.value,
      start: scheduleStart.value,
    },
    idleThresholdSeconds: Math.round(idleMinutes * 60),
    retentionDays: Math.round(retention),
    trackingEnabled: trackingEnabled.checked,
    warningPercent: Math.round(warning),
  };
}

function renderSettings(dashboard: DashboardData): void {
  currentSettings = dashboard.settings;
  trackingEnabled.checked = dashboard.settings.trackingEnabled;
  idleThreshold.value = String(dashboard.settings.idleThresholdSeconds / 60);
  warningPercent.value = String(dashboard.settings.warningPercent);
  retentionDays.value = String(dashboard.settings.retentionDays);
  blockedSites.value = dashboard.settings.blockedSites.join("\n");
  scheduleEnabled.checked = dashboard.settings.focusSchedule.enabled;
  scheduleStart.value = dashboard.settings.focusSchedule.start;
  scheduleEnd.value = dashboard.settings.focusSchedule.end;
  scheduleSites.value =
    dashboard.settings.focusSchedule.blockedSites.join("\n");
  storageUsage.textContent = `${(dashboard.bytesInUse / 1024).toFixed(1)} KB`;

  for (const input of document.querySelectorAll<HTMLInputElement>(
    'input[name="schedule-day"]',
  )) {
    input.checked = dashboard.settings.focusSchedule.days.includes(
      Number(input.value),
    );
  }

  limitsList.replaceChildren();
  for (const [domain, minutes] of Object.entries(
    dashboard.settings.dailyLimits,
  ).sort(([left], [right]) => left.localeCompare(right))) {
    addLimit(domain, minutes);
  }

  categoriesList.replaceChildren();
  for (const [domain, category] of Object.entries(
    dashboard.settings.categories,
  ).sort(([left], [right]) => left.localeCompare(right))) {
    addCategory(domain, category);
  }
  refreshEmptyStates();
}

async function loadSettings(): Promise<void> {
  try {
    renderSettings(
      await sendMessage<DashboardData>({ days: 1, type: "GET_DASHBOARD" }),
    );
  } catch (error) {
    showStatus(
      saveStatus,
      error instanceof Error ? error.message : "Could not load settings.",
      true,
    );
  }
}

interface ExportResponse {
  content: string;
  filename: string;
  mimeType: string;
}

async function exportData(format: "csv" | "json"): Promise<void> {
  const exported = await sendMessage<ExportResponse>({
    format,
    type: "EXPORT_DATA",
  });
  downloadText(exported.content, exported.filename, exported.mimeType);
  showStatus(saveStatus, `${format.toUpperCase()} export created.`);
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  void (async () => {
    try {
      const response = await sendMessage<{ settings: Settings }>({
        settings: readFormSettings(),
        type: "SAVE_SETTINGS",
      });
      currentSettings = response.settings;
      showStatus(saveStatus, "Settings saved.");
      await loadSettings();
    } catch (error) {
      showStatus(
        saveStatus,
        error instanceof Error ? error.message : "Could not save settings.",
        true,
      );
    }
  })();
});

requiredElement<HTMLButtonElement>("#add-limit").addEventListener("click", () =>
  addLimit(),
);
requiredElement<HTMLButtonElement>("#add-category").addEventListener(
  "click",
  () => addCategory(),
);
requiredElement<HTMLButtonElement>("#export-json").addEventListener(
  "click",
  () => {
    void exportData("json").catch((error: unknown) =>
      showStatus(
        saveStatus,
        error instanceof Error ? error.message : "Export failed.",
        true,
      ),
    );
  },
);
requiredElement<HTMLButtonElement>("#export-csv").addEventListener(
  "click",
  () => {
    void exportData("csv").catch((error: unknown) =>
      showStatus(
        saveStatus,
        error instanceof Error ? error.message : "Export failed.",
        true,
      ),
    );
  },
);
requiredElement<HTMLButtonElement>("#import-json").addEventListener(
  "click",
  () => {
    importFile.click();
  },
);

importFile.addEventListener("change", () => {
  void (async () => {
    const file = importFile.files?.[0];
    if (!file) {
      return;
    }
    try {
      const data = JSON.parse(await file.text()) as unknown;
      await sendMessage({ data, type: "IMPORT_DATA" });
      showStatus(saveStatus, "Backup restored.");
      await loadSettings();
    } catch (error) {
      showStatus(
        saveStatus,
        error instanceof Error ? error.message : "Could not restore backup.",
        true,
      );
    } finally {
      importFile.value = "";
    }
  })();
});

requiredElement<HTMLButtonElement>("#reset-data").addEventListener(
  "click",
  () => {
    if (
      !confirm("Delete all Focus Meter usage history? Settings will remain.")
    ) {
      return;
    }
    void (async () => {
      try {
        await sendMessage({ type: "RESET_DATA" });
        showStatus(saveStatus, "Usage history deleted.");
        await loadSettings();
      } catch (error) {
        showStatus(
          saveStatus,
          error instanceof Error
            ? error.message
            : "Could not delete usage history.",
          true,
        );
      }
    })();
  },
);

void loadSettings();
