import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { now, one, run, transaction } from "@/lib/db";

export type AuthTokenType = "email_verification" | "password_reset";

export function hashAuthToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createAuthToken(userId: number, type: AuthTokenType, lifetimeMinutes: number) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + lifetimeMinutes * 60_000).toISOString();
  await transaction(async () => {
    await run("DELETE FROM auth_tokens WHERE user_id = ? AND type = ?", userId, type);
    await run(
      `INSERT INTO auth_tokens (user_id, type, token_hash, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      userId,
      type,
      hashAuthToken(token),
      expiresAt,
      now(),
    );
  });
  return token;
}

export async function findValidAuthToken(token: string, type: AuthTokenType) {
  if (!/^[A-Za-z0-9_-]{40,100}$/.test(token)) return null;
  return one<{ id: number; user_id: number }>(
    `SELECT id, user_id FROM auth_tokens
     WHERE token_hash = ? AND type = ? AND consumed_at IS NULL AND expires_at > ?`,
    hashAuthToken(token),
    type,
    new Date().toISOString(),
  );
}
