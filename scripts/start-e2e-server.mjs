import { rmSync } from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

const host = "127.0.0.1";
const port = "3100";
const origin = `http://${host}:${port}`;
const databasePath = path.join(process.cwd(), "data", "e2e.sqlite");

if (!origin.startsWith("http://127.0.0.1:")) {
  throw new Error("E2E tests may only start against the local loopback interface.");
}

for (const suffix of ["", "-shm", "-wal"]) rmSync(`${databasePath}${suffix}`, { force: true });

const env = {
  ...process.env,
  APP_ENV: "development",
  APP_ORIGIN: origin,
  DATABASE_PATH: databasePath,
  DEMO_PASSWORD: "e2e-test-password",
  TURSO_DATABASE_URL: "",
  TURSO_AUTH_TOKEN: "",
};

const setup = spawnSync(process.execPath, ["scripts/setup-database.mjs"], {
  cwd: process.cwd(),
  env,
  encoding: "utf8",
});
if (setup.status !== 0) {
  process.stderr.write(setup.stderr || setup.stdout || "E2E database setup failed.\n");
  process.exit(setup.status ?? 1);
}

const server = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "dev", "--hostname", host, "--port", port],
  { cwd: process.cwd(), env, stdio: "inherit" },
);

function stop(signal) {
  if (!server.killed) server.kill(signal);
}

process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));
server.on("exit", (code) => process.exit(code ?? 0));
