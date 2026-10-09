#!/usr/bin/env node
/**
 * Wrapper do electron-builder para o build Windows com target Microsoft Store.
 *
 * - Env vars MS_STORE_IDENTITY_NAME, MS_STORE_PUBLISHER_CN e
 *   MS_STORE_PUBLISHER_DISPLAY presentes → build gera NSIS + APPX
 *   (o .appxupload sai em dist-electron/).
 * - Qualquer env ausente → remove temporariamente o target "appx" do
 *   package.json para o electron-builder não tentar empacotar MSIX com
 *   identity vazio; restaura o arquivo original ao final (finally).
 *
 * Uso: node scripts/build-electron.mjs -- --win --x64 [--publish always]
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const REQUIRED_ENV = [
  "MS_STORE_IDENTITY_NAME",
  "MS_STORE_PUBLISHER_CN",
  "MS_STORE_PUBLISHER_DISPLAY",
];

const pkgPath = new URL("../package.json", import.meta.url);
const original = readFileSync(pkgPath, "utf8");

const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
const storeEnabled = missing.length === 0;

if (storeEnabled) {
  console.log("[build-electron] MS Store env ok — target appx ATIVO");
} else {
  console.log(
    `[build-electron] sem env de MS Store (${missing.join(", ")}) — target appx removido deste build`,
  );
  const pkg = JSON.parse(original);
  pkg.build.win.target = pkg.build.win.target.filter((t) => t.target !== "appx");
  delete pkg.build.appx;
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
}

try {
  const args = process.argv.slice(process.argv.indexOf("--") + 1);
  const res = spawnSync("npx", ["electron-builder", ...args], {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  process.exitCode = res.status ?? 1;
} finally {
  // Restaura o package.json original (com o target appx) sempre.
  writeFileSync(pkgPath, original);
}
