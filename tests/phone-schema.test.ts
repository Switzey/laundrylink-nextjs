import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterAll, test } from "vitest";
import { DatabaseSync } from "node:sqlite";

const directory = mkdtempSync(path.join(tmpdir(), "laundrylink-phone-test-"));
const databasePath = path.join(directory, "laundrylink.sqlite");
const setup = spawnSync(process.execPath, ["scripts/setup-database.mjs"], {
  cwd: process.cwd(),
  env: { ...process.env, DATABASE_PATH: databasePath, TURSO_DATABASE_URL: "", TURSO_AUTH_TOKEN: "" },
  encoding: "utf8",
});
assert.equal(setup.status, 0, setup.stderr || setup.stdout);
const database = new DatabaseSync(databasePath);

afterAll(() => {
  database.close();
  rmSync(directory, { recursive: true, force: true });
});

test("database rejects changing a verified account phone without clearing its binding", () => {
  assert.throws(() => database.prepare(
    "UPDATE users SET phone = '+2348099999999' WHERE email = 'cleaner@example.com'",
  ).run(), /verified phone does not match/i);
});

test("secure phone change preserves the existing login session", () => {
  const user = database.prepare("SELECT id FROM users WHERE email = 'cleaner@example.com'").get() as { id: number };
  database.prepare(
    "INSERT INTO js_sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
  ).run("a".repeat(64), user.id, "2026-10-20T08:00:00.000Z", "2026-10-13T08:00:00.000Z");
  database.prepare(
    "UPDATE users SET phone = ?, phone_verified_at = NULL, phone_verified_e164 = NULL WHERE id = ?",
  ).run("+2348099999999", user.id);
  const sessions = database.prepare("SELECT COUNT(1) AS count FROM js_sessions WHERE user_id = ?").get(user.id) as { count: number };
  assert.equal(sessions.count, 1);
});

test("database prevents an unverified business phone from remaining available", () => {
  const cleaner = database.prepare("SELECT id FROM cleaners LIMIT 1").get() as { id: number };
  assert.throws(() => database.prepare(
    "UPDATE cleaners SET phone = '+2348098888888' WHERE id = ?",
  ).run(cleaner.id), /verified business phone does not match/i);
  database.prepare(
    `UPDATE cleaners SET phone = ?, business_phone_verified_at = NULL,
       business_phone_verified_e164 = NULL, is_available = 0 WHERE id = ?`,
  ).run("+2348098888888", cleaner.id);
  const state = database.prepare(
    "SELECT business_phone_verified_at, business_phone_verified_e164, is_available FROM cleaners WHERE id = ?",
  ).get(cleaner.id) as { business_phone_verified_at: null; business_phone_verified_e164: null; is_available: number };
  assert.equal(state.business_phone_verified_at, null);
  assert.equal(state.business_phone_verified_e164, null);
  assert.equal(state.is_available, 0);
});

test("verification-attempt constraints require a valid target purpose", () => {
  const user = database.prepare("SELECT id FROM users WHERE email = 'cleaner@example.com'").get() as { id: number };
  assert.throws(() => database.prepare(
    `INSERT INTO phone_verification_attempts
      (user_id, cleaner_id, purpose, phone_e164, provider_sid, status, expires_at, created_at, updated_at)
     VALUES (?, NULL, 'vendor_business', '+2348099999999', 'VE12345678', 'pending', ?, ?, ?)`,
  ).run(user.id, "2026-10-13T08:10:00.000Z", "2026-10-13T08:00:00.000Z", "2026-10-13T08:00:00.000Z"), /constraint/i);
});
