import "server-only";

import { now, one, run, transaction } from "@/lib/db";
import { opaqueIdentifier, type RequestSecurityContext } from "@/lib/request-security";

export type RateLimitRule = {
  limit: number;
  windowSeconds: number;
};

export class RateLimitError extends Error {
  retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super("Too many requests. Please try again later.");
    this.name = "RateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export async function enforceRateLimit(
  scope: string,
  subject: string,
  rule: RateLimitRule,
  context: RequestSecurityContext,
) {
  const key = opaqueIdentifier(`${scope}:${subject}:${context.ipHash}`);
  const windowStartedAt = Math.floor(Date.now() / 1000);
  const expiresAt = windowStartedAt + rule.windowSeconds;

  const current = await transaction(async () => {
    await run(
      `INSERT INTO rate_limits (key, scope, request_count, window_started_at, expires_at, updated_at)
       VALUES (?, ?, 1, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         request_count = CASE WHEN rate_limits.expires_at <= excluded.window_started_at THEN 1 ELSE rate_limits.request_count + 1 END,
         window_started_at = CASE WHEN rate_limits.expires_at <= excluded.window_started_at THEN excluded.window_started_at ELSE rate_limits.window_started_at END,
         expires_at = CASE WHEN rate_limits.expires_at <= excluded.window_started_at THEN excluded.expires_at ELSE rate_limits.expires_at END,
         updated_at = excluded.updated_at`,
      key,
      scope,
      windowStartedAt,
      expiresAt,
      now(),
    );
    await run("DELETE FROM rate_limits WHERE expires_at < ?", windowStartedAt - 86_400);
    return one<{ request_count: number; expires_at: number }>(
      "SELECT request_count, expires_at FROM rate_limits WHERE key = ?",
      key,
    );
  });

  if (!current || Number(current.request_count) > rule.limit) {
    const retryAfter = Math.max(1, Number(current?.expires_at ?? expiresAt) - windowStartedAt);
    throw new RateLimitError(retryAfter);
  }
}
