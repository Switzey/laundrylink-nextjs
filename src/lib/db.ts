import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";
import { copyFileSync, existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createClient, type Client, type InValue, type ResultSet, type Transaction } from "@libsql/client";

const bundledDatabasePath = path.join(process.cwd(), "data", "laundrylink.sqlite");
const localDatabasePath =
  process.env.DATABASE_PATH ??
  (process.env.VERCEL ? path.join("/tmp", "laundrylink.sqlite") : bundledDatabasePath);

if (!process.env.TURSO_DATABASE_URL && process.env.VERCEL && !existsSync(localDatabasePath)) {
  copyFileSync(bundledDatabasePath, localDatabasePath);
}

const databaseUrl = process.env.TURSO_DATABASE_URL ?? pathToFileURL(localDatabasePath).href;

const globalForDatabase = globalThis as unknown as { laundryLinkDatabase?: Client };

export const db =
  globalForDatabase.laundryLinkDatabase ??
  createClient({
    url: databaseUrl,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDatabase.laundryLinkDatabase = db;
}

type QueryExecutor = Pick<Client, "execute"> | Pick<Transaction, "execute">;
const transactionContext = new AsyncLocalStorage<QueryExecutor>();

function executor() {
  return transactionContext.getStore() ?? db;
}

async function execute(sql: string, values: InValue[]): Promise<ResultSet> {
  return executor().execute({ sql, args: values });
}

export async function all<T>(sql: string, ...values: InValue[]): Promise<T[]> {
  const result = await execute(sql, values);
  return result.rows as unknown as T[];
}

export async function one<T>(sql: string, ...values: InValue[]): Promise<T | null> {
  const rows = await all<T>(sql, ...values);
  return rows[0] ?? null;
}

export async function run(sql: string, ...values: InValue[]) {
  const result = await execute(sql, values);
  return {
    changes: result.rowsAffected,
    lastInsertRowid: result.lastInsertRowid ?? 0,
  };
}

export async function transaction<T>(callback: () => Promise<T>): Promise<T> {
  const tx = await db.transaction("write");
  try {
    const result = await transactionContext.run(tx, callback);
    await tx.commit();
    return result;
  } catch (error) {
    await tx.rollback();
    throw error;
  } finally {
    tx.close();
  }
}

export function now() {
  return new Date().toISOString().replace("T", " ").replace("Z", "");
}
