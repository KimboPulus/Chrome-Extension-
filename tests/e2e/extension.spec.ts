import AxeBuilder from "@axe-core/playwright";
import {
  expect,
  test,
  chromium,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

test.describe.configure({ mode: "serial" });

let context: BrowserContext;
let extensionId: string;
let userDataDir: string;

test.beforeAll(async () => {
  const extensionPath = resolve("dist");
  userDataDir = await mkdtemp(resolve(tmpdir(), "focus-meter-e2e-"));
  context = await chromium.launchPersistentContext(userDataDir, {
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
    channel: "chromium",
    headless: true,
  });

  let [worker] = context.serviceWorkers();
  worker ??= await context.waitForEvent("serviceworker");
  extensionId = new URL(worker.url()).host;
});

test.afterAll(async () => {
  await context.close();
  await rm(userDataDir, { force: true, recursive: true });
});

async function openExtensionPage(path: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/${path}`);
  return page;
}

async function expectAccessible(page: Page): Promise<void> {
  const result = await new AxeBuilder({ page }).analyze();
  expect(result.violations).toEqual([]);
}

test("popup loads dashboard data without runtime errors", async () => {
  const page = await openExtensionPage("popup/popup.html");
  await expect(page.getByRole("heading", { name: "0m" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Open dashboard" }),
  ).toBeVisible();
  await expectAccessible(page);
  await page.close();
});

test("options page exposes focus, privacy, and data controls", async () => {
  const page = await openExtensionPage("options/options.html");
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Tracking and privacy" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Export backup" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add category" }).click();
  await page.locator(".category-domain").fill("youtube.com");
  await page.locator(".category-value").selectOption("distracting");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByRole("status")).toHaveText("Settings saved.");
  await expectAccessible(page);
  await page.close();
});

test("side panel runs a focus session and installs blocking rules", async () => {
  const page = await openExtensionPage("sidepanel/sidepanel.html");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Manual session" }),
  ).toBeVisible();
  await expect(page.getByText("No activity recorded today.")).toBeVisible();
  await page.getByLabel("Session length in minutes").fill("5");
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page.getByRole("status")).toHaveText("Focus session started.");
  await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(async () =>
        chrome.declarativeNetRequest
          .getDynamicRules()
          .then((rules) =>
            rules.some((rule) =>
              rule.condition.requestDomains?.includes("youtube.com"),
            ),
          ),
      ),
    )
    .toBe(true);
  const blockedPage = await context.newPage();
  await blockedPage.goto("https://youtube.com/", {
    waitUntil: "domcontentloaded",
  });
  await expect(blockedPage).toHaveURL(
    new RegExp(`^chrome-extension://${extensionId}/blocked/blocked\\.html`),
  );
  await expect(
    blockedPage.getByRole("heading", { name: "This website is blocked" }),
  ).toBeVisible();
  await blockedPage.close();
  await expectAccessible(page);
  await page.getByRole("button", { name: "Stop" }).click();
  await expect(page.getByRole("status")).toHaveText("Focus session stopped.");
  await page.close();
});
