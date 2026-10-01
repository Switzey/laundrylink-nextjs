import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NextResponse } from "next/server";
import { all, now, one, run } from "@/lib/db";
import { appConfig } from "@/lib/env";
import { ROLES, roleRequiresPhoneVerification, type Role, type User } from "@/lib/types";

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function normalizeRole(value: string): Role {
  const legacy: Record<string, Role> = {
    customer: "CUSTOMER",
    cleaner: "VENDOR_OWNER",
    admin: "ADMIN",
  };
  const normalized = legacy[value] ?? value;
  if (!ROLES.includes(normalized as Role)) throw new Error("Account role is invalid.");
  return normalized as Role;
}

async function issueSession(userId: number) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + appConfig.sessionDays * 86_400_000);

  await run("DELETE FROM js_sessions WHERE expires_at <= ?", new Date().toISOString());
  await run(
    `DELETE FROM js_sessions WHERE user_id = ? AND id NOT IN
      (SELECT id FROM js_sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 9)`,
    userId,
    userId,
  );
  await run(
    "INSERT INTO js_sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
    hashToken(token), userId, expiresAt.toISOString(), now(),
  );

  return { token, expiresAt };
}

function sessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: !appConfig.isDevelopment,
    path: "/",
    expires: expiresAt,
    maxAge: appConfig.sessionDays * 86_400,
    priority: "high" as const,
  };
}

export async function createSession(userId: number) {
  const { token, expiresAt } = await issueSession(userId);

  const cookieStore = await cookies();
  cookieStore.set(appConfig.sessionCookieName, token, sessionCookieOptions(expiresAt));
}

export async function createSessionOnResponse(userId: number, response: NextResponse) {
  const { token, expiresAt } = await issueSession(userId);
  response.cookies.set(appConfig.sessionCookieName, token, sessionCookieOptions(expiresAt));
}

export async function destroySession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(appConfig.sessionCookieName)?.value;
  if (token) await run("DELETE FROM js_sessions WHERE token_hash = ?", hashToken(token));
  cookieStore.delete(appConfig.sessionCookieName);
}

export async function getCurrentUser(): Promise<User | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(appConfig.sessionCookieName)?.value;
  if (!token) return null;

  await run("DELETE FROM js_sessions WHERE expires_at <= ?", new Date().toISOString());
  const user = await one<Omit<User, "role"> & { role: string }>(
    `SELECT u.id, u.name, u.email, u.role, u.phone, u.address, u.email_verified_at, u.phone_verified_at
     FROM js_sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > ?`,
    hashToken(token), new Date().toISOString(),
  );
  return user ? { ...user, role: normalizeRole(user.role) } : null;
}

export async function requireUser(
  roles?: Role | Role[],
  options: { allowUnverified?: boolean } = {},
): Promise<User> {
  const cookieStore = await cookies();
  const hadSessionCookie = Boolean(cookieStore.get(appConfig.sessionCookieName)?.value);
  const user = await getCurrentUser();
  if (!user) {
    redirect(hadSessionCookie
      ? "/login?error=Your+session+expired.+Please+sign+in+again."
      : "/login?error=Please+sign+in+to+continue");
  }
  const allowedRoles = roles ? (Array.isArray(roles) ? roles : [roles]) : null;
  if (allowedRoles && !allowedRoles.includes(user.role)) redirect("/dashboard");
  if (!options.allowUnverified && !user.email_verified_at) redirect("/verify-email");
  if (!options.allowUnverified && roleRequiresPhoneVerification(user.role) && !user.phone_verified_at) {
    redirect("/verify-phone");
  }
  return user;
}

export async function cleanerIdForUser(userId: number) {
  return (await one<{ id: number }>(
    `SELECT id FROM cleaners WHERE user_id = ?
     UNION
     SELECT cleaner_id AS id FROM vendor_memberships WHERE user_id = ?
     LIMIT 1`,
    userId,
    userId,
  ))?.id ?? null;
}

export function dashboardForRole(role: Role) {
  if (["ADMIN", "SUPER_ADMIN"].includes(role)) return "/admin/dashboard";
  if (role === "SUPPORT_AGENT") return "/admin/reviews";
  if (role === "RIDER") return "/admin/logistics";
  if (["VENDOR_OWNER", "VENDOR_MANAGER", "VENDOR_STAFF"].includes(role)) return "/cleaner/dashboard";
  return "/customer/dashboard";
}

export function destinationForUser(user: User) {
  if (!user.email_verified_at) return "/verify-email";
  if (roleRequiresPhoneVerification(user.role) && !user.phone_verified_at) return "/verify-phone";
  return dashboardForRole(user.role);
}

export async function getAllAdmins() {
  return all<{ id: number }>("SELECT id FROM users WHERE role IN ('ADMIN', 'SUPER_ADMIN', 'admin')");
}

