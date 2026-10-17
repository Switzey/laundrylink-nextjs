/**
 * LaundryLink Expo bootstrap: opt-in local setup only.
 * Safeguards: no Vercel deployment, no database migrations, no network secrets.
 *
 * Execute at the repository root: node scripts/bootstrap-expo-mobile.mjs
 * Use --dry-run to inspect the generator command without executing it.
 */
import { existsSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appPath = path.join(root, "apps", "mobile");
const dryRun = process.argv.includes("--dry-run");
const execName = process.platform === "win32" ? "npx.cmd" : "npx";
const args = [
  "--yes",
  "create-expo-app@latest",
  "apps/mobile",
  "--template",
  "default@sdk-58",
];

if (existsSync(appPath)) {
  console.error("Refusing to overwrite apps/mobile. Review the existing Expo project.");
  process.exitCode = 1;
} else if (dryRun) {
  console.log("Working directory:", root);
  console.log("Command:", execName, ...args);
  console.log("This dry run did not create files, install packages or contact providers.");
} else {
  mkdirSync(path.join(root, "apps"), { recursive: true });
  console.log("Scaffolding the standalone LaundryLink Expo app; no backend changes.");
  const result = spawnSync(execName, args, {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.error) {
    console.error(result.error.message);
    process.exitCode = 1;
  } else {
    process.exitCode = result.status ?? 1;
  }
  if (process.exitCode === 0) {
    console.log("\nNext: cd apps/mobile");
    console.log("Then: npx expo install expo-secure-store expo-auth-session expo-web-browser expo-linking");
    console.log("Then: npx expo start");
    console.log("Configure only public staging API URL on the client; keep secrets server-side.");
  }
}
