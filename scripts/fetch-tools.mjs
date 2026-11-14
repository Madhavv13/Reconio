// Downloads the pinned recon tools, verifies each zip against tools.lock.json,
// extracts the binary and places it as a Tauri sidecar: src-tauri/binaries/<tool>-<target-triple>[.exe].
// Also writes src-tauri/binaries/manifest.json with the SHA-256 of each extracted binary,
// which the app's tool check (ONB-02) compares against at startup.
//
// Usage: node scripts/fetch-tools.mjs [--target <triple>] [--force]
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import AdmZip from "adm-zip";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const lock = JSON.parse(readFileSync(join(root, "tools.lock.json"), "utf8"));
const outDir = join(root, "src-tauri", "binaries");
const args = process.argv.slice(2);
const force = args.includes("--force");
const targetArg = args.indexOf("--target");
const target =
  targetArg >= 0
    ? args[targetArg + 1]
    : /host: (\S+)/.exec(execSync("rustc -vV", { encoding: "utf8" }))[1];

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const isWindows = target.includes("windows");

mkdirSync(outDir, { recursive: true });
const manifestPath = join(outDir, "manifest.json");
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : {};
manifest[target] ??= {};

let failed = false;
for (const [tool, spec] of Object.entries(lock.tools)) {
  const asset = spec.assets[target];
  if (!asset) {
    console.error(`✗ ${tool}: no pinned asset for ${target}`);
    failed = true;
    continue;
  }
  const exeName = `${tool}${isWindows ? ".exe" : ""}`;
  const dest = join(outDir, `${tool}-${target}${isWindows ? ".exe" : ""}`);
  const known = manifest[target][tool];
  if (!force && known?.version === spec.version && existsSync(dest) && sha256(readFileSync(dest)) === known.sha256) {
    console.log(`✓ ${tool} ${spec.version} already present`);
    continue;
  }

  const url = `https://github.com/projectdiscovery/${tool}/releases/download/v${spec.version}/${asset.file}`;
  process.stdout.write(`↓ ${tool} ${spec.version} ... `);
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`download failed: HTTP ${res.status}`);
    failed = true;
    continue;
  }
  const zipBuf = Buffer.from(await res.arrayBuffer());
  const got = sha256(zipBuf);
  if (got !== asset.sha256) {
    console.error(`CHECKSUM MISMATCH\n  expected ${asset.sha256}\n  got      ${got}`);
    failed = true;
    continue;
  }
  const entry = new AdmZip(zipBuf).getEntries().find((e) => e.entryName.split("/").pop() === exeName);
  if (!entry) {
    console.error(`zip has no ${exeName}`);
    failed = true;
    continue;
  }
  const bin = entry.getData();
  writeFileSync(dest, bin);
  if (!isWindows) chmodSync(dest, 0o755);
  manifest[target][tool] = { version: spec.version, sha256: sha256(bin) };
  console.log("verified");
}

writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
if (failed) {
  console.error("\nOne or more tools failed. Nothing unverified was installed.");
  process.exit(1);
}
