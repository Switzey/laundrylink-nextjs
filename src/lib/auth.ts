import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { all, now, one, run } from "@/lib/db";
import { appConfig } from "@/lib/env";
import type { Role, User } from "@/lib/types";

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: number) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + appConfig.sessionDays * 86_400_000);

  await run("DELETE FROM js_sessions WHERE expires_at <= ?", new Date().toISOString());
  await run(
    "INSERT INTO js_sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
    hashToken(token), userId, expiresAt.toISOString(), now(),
  );

  const cookieStore = await cookies();
  cookieStore.set(appConfig.sessionCookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: !appConfig.isDevelopment,
    path: "/",
    expires: expiresAt,
    maxAge: appConfig.sessionDays * 86_400,
    priority: "high",
  });
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
  return await one<User>(
    `SELECT u.id, u.name, u.email, u.role, u.phone, u.address
     FROM js_sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > ?`,
    hashToken(token), new Date().toISOString(),
  );
}

export async function requireUser(roles?: Role | Role[]): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const allowedRoles = roles ? (Array.isArray(roles) ? roles : [roles]) : null;
  if (allowedRoles && !allowedRoles.includes(user.role)) redirect("/dashboard");
  return user;
}

export async function cleanerIdForUser(userId: number) {
  return (await one<{ id: number }>("SELECT id FROM cleaners WHERE user_id = ?", userId))?.id ?? null;
}

export function dashboardForRole(role: Role) {
  if (role === "admin") return "/admin/dashboard";
  if (role === "cleaner") return "/cleaner/dashboard";
  return "/customer/dashboard";
}

export async function getAllAdmins() {
  return all<{ id: number }>("SELECT id FROM users WHERE role = 'admin'");
}

