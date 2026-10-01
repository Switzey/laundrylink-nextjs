import { NextRequest, NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/audit";
import { findValidAuthToken } from "@/lib/auth-tokens";
import { createSessionOnResponse, destinationForUser, normalizeRole } from "@/lib/auth";
import { authPath, sanitizeReturnTo } from "@/lib/auth-intent";
import { now, one, run, transaction } from "@/lib/db";
import type { User } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  const returnTo = sanitizeReturnTo(request.nextUrl.searchParams.get("returnTo"));
  const record = await findValidAuthToken(token, "email_verification");
  if (!record) {
    return NextResponse.redirect(
      new URL(authPath("/verify-email", returnTo, { error: "This verification link is invalid or expired." }), request.url),
      { status: 303 },
    );
  }

  const verified = await transaction(async () => {
    const consumed = await run(
      "UPDATE auth_tokens SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL",
      now(),
      record.id,
    );
    if (!consumed.changes) return false;
    await run(
      "UPDATE users SET email_verified_at = COALESCE(email_verified_at, ?), updated_at = ? WHERE id = ?",
      now(),
      now(),
      record.user_id,
    );
    await run(
      "DELETE FROM auth_tokens WHERE user_id = ? AND type = 'email_verification' AND id <> ?",
      record.user_id,
      record.id,
    );
    await writeAuditLog({
      actorUserId: record.user_id,
      action: "auth.email_verified",
      targetType: "user",
      targetId: record.user_id,
      outcome: "succeeded",
    });
    return true;
  });

  if (!verified) {
    return NextResponse.redirect(
      new URL(authPath("/verify-email", returnTo, { error: "This verification link was already used." }), request.url),
      { status: 303 },
    );
  }
  const account = await one<Omit<User, "role"> & { role: string }>(
    `SELECT id, name, email, role, phone, address, email_verified_at, phone_verified_at
     FROM users WHERE id = ?`,
    record.user_id,
  );
  if (!account) {
    return NextResponse.redirect(new URL("/login?error=Account+not+found.", request.url), { status: 303 });
  }
  const user: User = { ...account, role: normalizeRole(account.role) };
  const response = NextResponse.redirect(new URL(destinationForUser(user, returnTo), request.url), { status: 303 });
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  await createSessionOnResponse(record.user_id, response);
  return response;
}
