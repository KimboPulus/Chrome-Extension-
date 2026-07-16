import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

describe("extension manifest", () => {
  it("uses MV3, a side panel, packaged code, and reviewed permissions", async () => {
    const manifest = JSON.parse(
      await readFile(resolve("manifest.json"), "utf8"),
    ) as Record<string, unknown>;

    expect(manifest.manifest_version).toBe(3);
    expect(manifest.minimum_chrome_version).toBe("116");
    expect(manifest.side_panel).toEqual({
      default_path: "sidepanel/sidepanel.html",
    });
    expect(manifest.permissions).toEqual([
      "alarms",
      "declarativeNetRequest",
      "idle",
      "sidePanel",
      "storage",
      "tabs",
    ]);
    expect(JSON.stringify(manifest)).not.toMatch(/https?:\/\/[^"*]/);
  });
});
