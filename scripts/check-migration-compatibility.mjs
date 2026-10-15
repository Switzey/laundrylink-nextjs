import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createClient } from "@libsql/client";
import { applyAuthSchemaToSqlite } from "./auth-schema.mjs";
import { applyOnboardingSchemaToSqlite } from "./onboarding-schema.mjs";
import { applySecuritySchemaToSqlite } from "./security-schema.mjs";

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url || (url.startsWith("libsql:") && !authToken)) {
  throw new Error("TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are required.");
}

const client = createClient({ url, authToken });
const databasePath = path.join(os.tmpdir(), `laundrylink-schema-${randomUUID()}.sqlite`);
const database = new DatabaseSync(databasePath);

function requiredColumn(table, column) {
  const columns = database.prepare(`PRAGMA table_info("${table}")`).all();
  if (!columns.some((item) => String(item.name) === column)) {
    throw new Error(`Migration compatibility check is missing ${table}.${column}.`);
  }
}

function requiredObject(type, name) {
  const object = database.prepare("SELECT 1 FROM sqlite_master WHERE type = ? AND name = ?").get(type, name);
  if (!object) throw new Error(`Migration compatibility check is missing ${type} ${name}.`);
}

function applyMigrations() {
  applyAuthSchemaToSqlite(database);
  applyOnboardingSchemaToSqlite(database);
  applySecuritySchemaToSqlite(database);
}

try {
  const sourceSchema = await client.execute(`
    SELECT name, sql
    FROM sqlite_master
    WHERE type = 'table' AND sql IS NOT NULL AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `);

  if (!sourceSchema.rows.length) throw new Error("The hosted database schema is empty.");

  database.exec("PRAGMA foreign_keys = OFF");
  for (const object of sourceSchema.rows) database.exec(String(object.sql));
  database.exec("PRAGMA foreign_keys = ON");

  applyMigrations();
  applyMigrations();

  requiredObject("table", "phone_verification_attempts");
  requiredObject("table", "vendor_verifications");
  requiredObject("table", "vendor_files");
  requiredObject("view", "vendor_eligibility");
  requiredColumn("users", "phone_verified_e164");
  requiredColumn("cleaners", "business_phone_verified_at");
  requiredColumn("cleaners", "business_phone_verified_e164");
  requiredColumn("cleaners", "is_published");
  requiredColumn("cleaners", "is_suspended");

  const foreignKeyFailures = database.prepare("PRAGMA foreign_key_check").all();
  if (foreignKeyFailures.length) throw new Error("The migrated schema failed its foreign-key check.");

  console.log(JSON.stringify({
    sourceTables: sourceSchema.rows.length,
    migrationPasses: 2,
    foreignKeyFailures: 0,
    compatible: true,
  }));
} finally {
  database.close();
  client.close();
  for (const suffix of ["", "-shm", "-wal"]) rmSync(`${databasePath}${suffix}`, { force: true });
}
