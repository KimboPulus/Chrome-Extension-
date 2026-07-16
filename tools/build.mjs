import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outdir = join(root, "dist");
const production = process.argv.includes("--production");

await rm(outdir, { force: true, recursive: true });
await mkdir(outdir, { recursive: true });

const buildOptions = {
  bundle: true,
  format: "iife",
  legalComments: "none",
  minify: production,
  platform: "browser",
  sourcemap: production ? false : "inline",
  target: "chrome116",
};

const bundles = [
  ["src/platform/chrome/background.ts", "background.js"],
  ["src/ui/blocked.ts", "blocked/blocked.js"],
  ["src/platform/chrome/content-activity.ts", "content/activity.js"],
  ["src/ui/options.ts", "options/options.js"],
  ["src/ui/popup.ts", "popup/popup.js"],
  ["src/ui/sidepanel.ts", "sidepanel/sidepanel.js"],
];

await Promise.all(
  bundles.map(async ([entryPoint, outputFile]) => {
    const outfile = join(outdir, outputFile);
    await mkdir(dirname(outfile), { recursive: true });
    await build({
      ...buildOptions,
      entryPoints: [join(root, entryPoint)],
      outfile,
    });
  }),
);

for (const path of [
  "manifest.json",
  "blocked/blocked.css",
  "blocked/blocked.html",
  "icons",
  "options/options.css",
  "options/options.html",
  "popup/popup.css",
  "popup/popup.html",
  "sidepanel/sidepanel.css",
  "sidepanel/sidepanel.html",
  "styles",
]) {
  await cp(join(root, path), join(outdir, path), { recursive: true });
}
