import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { zipSync } from "fflate";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(root, "dist");
const release = join(root, "release");
const manifest = JSON.parse(
  await readFile(join(root, "manifest.json"), "utf8"),
);
const archiveName = `focus-meter-${manifest.version}.zip`;
const archivePath = join(release, archiveName);

async function collectFiles(directory) {
  const files = {};

  for (const entry of (await readdir(directory, { withFileTypes: true })).sort(
    (a, b) => a.name.localeCompare(b.name),
  )) {
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) {
      Object.assign(files, await collectFiles(absolute));
    } else {
      const archiveKey = relative(dist, absolute).split(sep).join("/");
      files[archiveKey] = new Uint8Array(await readFile(absolute));
    }
  }

  return files;
}

execFileSync(
  process.execPath,
  [join(root, "tools/build.mjs"), "--production"],
  {
    stdio: "inherit",
  },
);
await rm(release, { force: true, recursive: true });
await mkdir(release, { recursive: true });

const zip = zipSync(await collectFiles(dist), {
  level: 9,
  mtime: new Date(2000, 0, 1),
});
await writeFile(archivePath, zip);

const digest = createHash("sha256").update(zip).digest("hex");
await writeFile(`${archivePath}.sha256`, `${digest}  ${archiveName}\n`);

console.log(relative(root, archivePath));
