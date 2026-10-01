import { rmSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { createClient } from "@libsql/client";
import { applySecuritySchemaToLibsql } from "./security-schema.mjs";

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url || !authToken) {
  throw new Error("TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are required.");
}

const generatedSeedPath = path.join(process.cwd(), "data", "turso-safe-seed.sqlite");
const sourcePath = process.env.SEED_DATABASE_PATH || generatedSeedPath;

if (!process.env.SEED_DATABASE_PATH) {
  for (const suffix of ["", "-shm", "-wal"]) rmSync(`${generatedSeedPath}${suffix}`, { force: true });
  const setup = spawnSync(process.execPath, ["scripts/setup-database.mjs"], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_PATH: generatedSeedPath },
    stdio: "inherit",
  });
  if (setup.status !== 0) throw new Error("Unable to create the sanitized Turso seed database.");
}

const source = new DatabaseSync(sourcePath, { readOnly: true });
const destination = createClient({ url, authToken });
const allowedEmails = new Set(["admin@example.com", "customer@example.com", "cleaner@example.com"]);
const sourceEmails = source.prepare("SELECT email FROM users ORDER BY email").all().map((row) => String(row.email));

if (sourceEmails.length !== allowedEmails.size || sourceEmails.some((email) => !allowedEmails.has(email))) {
  throw new Error("Seed aborted: the local database contains accounts outside the safe demo allowlist.");
}

const objects = source.prepare(`
  SELECT type, name, sql
  FROM sqlite_master
  WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%'
  ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 ELSE 2 END, name
`).all();

for (const object of objects.filter((item) => item.type === "table")) {
  const existingTable = await destination.execute({
    sql: "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
    args: [String(object.name)],
  });
  if (!existingTable.rows.length) await destination.execute(String(object.sql));
}
await applySecuritySchemaToLibsql(destination);

const existingUsers = await destination.execute("SELECT COUNT(1) AS count FROM users");
if (Number(existingUsers.rows[0]?.count ?? 0) > 0) {
  console.log("Turso database already contains users; seed skipped.");
  destination.close();
  source.close();
  process.exit(0);
}

const tableOrder = [
  "users",
  "cleaners",
  "services",
  "addresses",
  "orders",
  "order_items",
  "payments",
  "reviews",
  "notifications",
  "order_activities",
  "js_sessions",
];

for (const table of tableOrder) {
  const columns = source.prepare(`PRAGMA table_info("${table}")`).all().map((column) => String(column.name));
  const rows = source.prepare(`SELECT * FROM "${table}"`).all();
  if (!rows.length) continue;

  const quotedColumns = columns.map((column) => `"${column}"`).join(", ");
  const placeholders = columns.map(() => "?").join(", ");
  const statements = rows.map((row) => ({
    sql: `INSERT INTO "${table}" (${quotedColumns}) VALUES (${placeholders})`,
    args: columns.map((column) => row[column]),
  }));

  for (let index = 0; index < statements.length; index += 100) {
    await destination.batch(statements.slice(index, index + 100), "write");
  }
}

for (const object of objects.filter((item) => item.type === "index")) {
  const existingIndex = await destination.execute({
    sql: "SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = ?",
    args: [String(object.name)],
  });
  if (!existingIndex.rows.length) await destination.execute(String(object.sql));
}

console.log("Seeded permanent Turso database from sanitized demo data.");
destination.close();
source.close();
