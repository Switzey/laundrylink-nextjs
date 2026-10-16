import { createHash, timingSafeEqual } from "node:crypto";
import { hash } from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { all, now, run, transaction } from "@/lib/db";
import { appConfig } from "@/lib/env";

export const dynamic = "force-dynamic";

const maintenanceTokenHash = "564e545f37537dcda76561cd0f49b16f0e52818c1fa2898ee8a0c19887d27034";
const requestSchema = z.object({
  password: z.string().min(12).max(128),
});

function authorized(request: NextRequest) {
  const token = request.headers.get("x-maintenance-token") ?? "";
  const actual = createHash("sha256").update(token).digest();
  const expected = Buffer.from(maintenanceTokenHash, "hex");
  return timingSafeEqual(actual, expected);
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const accounts = await all<{ id: number; email: string }>(
    "SELECT id, email FROM users WHERE lower(email) IN ('cleaner@example.com', 'customer@example.com') ORDER BY email",
  );
  if (accounts.length !== 2) {
    return NextResponse.json({ error: "Test accounts are not provisioned." }, { status: 409 });
  }

  const passwordHash = await hash(parsed.data.password, appConfig.bcryptCost);
  const timestamp = now();
  await transaction(async () => {
    for (const account of accounts) {
      await run(
        "UPDATE users SET password = ?, email_verified_at = COALESCE(email_verified_at, ?), updated_at = ? WHERE id = ?",
        passwordHash,
        timestamp,
        timestamp,
        account.id,
      );
      await run("DELETE FROM js_sessions WHERE user_id = ?", account.id);
      await run(
        `INSERT INTO audit_logs
          (actor_user_id, action, target_type, target_id, outcome, request_id, ip_hash, metadata, created_at)
         VALUES (NULL, 'maintenance.test_account_reset', 'user', ?, 'succeeded', ?, ?, ?, ?)`,
        String(account.id),
        `maintenance-${Date.now()}-${account.id}`,
        createHash("sha256").update(`maintenance:${account.id}`).digest("hex"),
        JSON.stringify({ email: account.email, sessionsRevoked: true }),
        timestamp,
      );
    }
  });

  return NextResponse.json({ updated: accounts.map((account) => account.email) });
}
