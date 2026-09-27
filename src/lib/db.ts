import "server-only";

import { copyFileSync, existsSync } from "node:fs";
import path from "node:path";

// Node 24 ships SQLite natively. The project intentionally avoids a PHP or ORM runtime.
// @ts-expect-error The scaffold currently bundles Node 20 type definitions.
import { DatabaseSync } from "node:sqlite";

const bundledDatabasePath = path.join(process.cwd(), "data", "laundrylink.sqlite");
const databasePath =
  process.env.DATABASE_PATH ??
  (process.env.VERCEL ? path.join("/tmp", "laundrylink.sqlite") : bundledDatabasePath);

// Vercel functions are read-only outside /tmp. Start each cold instance from the
// safe demo seed so reads and server actions both work in hosted previews.
if (process.env.VERCEL && !process.env.DATABASE_PATH && !existsSync(databasePath)) {
  copyFileSync(bundledDatabasePath, databasePath);
}

const globalForDatabase = globalThis as unknown as {
  laundryLinkDatabase?: InstanceType<typeof DatabaseSync>;
};

export const db =
  globalForDatabase.laundryLinkDatabase ?? new DatabaseSync(databasePath);

if (process.env.NODE_ENV !== "production") {
  globalForDatabase.laundryLinkDatabase = db;
}

db.exec(`
  PRAGMA foreign_keys = ON;
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS js_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token_hash TEXT NOT NULL UNIQUE,
    user_id INTEGER NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS js_sessions_user_id_index ON js_sessions(user_id);
  CREATE INDEX IF NOT EXISTS js_sessions_expires_at_index ON js_sessions(expires_at);
`);

export type SqlValue = string | number | bigint | null | Uint8Array;

export function all<T>(sql: string, ...values: SqlValue[]): T[] {
  return db.prepare(sql).all(...values) as T[];
}

export function one<T>(sql: string, ...values: SqlValue[]): T | null {
  return (db.prepare(sql).get(...values) as T | undefined) ?? null;
}

export function run(sql: string, ...values: SqlValue[]) {
  return db.prepare(sql).run(...values) as {
    changes: number;
    lastInsertRowid: number | bigint;
  };
}

export function transaction<T>(callback: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = callback();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function now() {
  return new Date().toISOString().replace("T", " ").replace("Z", "");
}

