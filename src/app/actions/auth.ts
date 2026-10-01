"use server";

import { compare, getRounds, hash } from "bcryptjs";
import { redirect } from "next/navigation";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import { authorizeAction, authorizePublicAction } from "@/lib/authorization";
import { createSession, dashboardForRole, destroySession } from "@/lib/auth";
import { now, one, run, transaction } from "@/lib/db";
import { appConfig } from "@/lib/env";
import { RateLimitError } from "@/lib/rate-limit";
import { emailAddress, optionalTextField, parseFormOrRedirect, strongPassword, textField } from "@/lib/validation";
import type { Role } from "@/lib/types";

const INVALID_PASSWORD_HASH = "$2b$12$fhC/QXVkKWPYGt2UA9.R3e4WGHEySkl.1vXaYPfRVKCWKc4mXljpC";

const loginSchema = z.object({
  email: emailAddress,
  password: z.string().min(1).max(128),
});

const registerSchema = z.object({
  name: textField(2, 100),
  email: emailAddress,
  password: strongPassword,
  role: z.enum(["customer", "cleaner"]),
  phone: optionalTextField(30).refine(
    (value) => !value || /^[+0-9().\-\s]{7,30}$/.test(value),
    "Enter a valid phone number.",
  ),
  address: optionalTextField(250),
});

function fail(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

async function authorizeAuthenticationAttempt(
  action: string,
  subject: string,
  path: string,
  limit: number,
  windowSeconds: number,
) {
  try {
    return await authorizePublicAction(action, subject, { limit, windowSeconds });
  } catch (error) {
    if (error instanceof RateLimitError) {
      fail(path, `Too many attempts. Try again in ${error.retryAfterSeconds} seconds.`);
    }
    throw error;
  }
}

export async function loginAction(formData: FormData) {
  const { email, password } = parseFormOrRedirect(
    loginSchema,
    formData,
    "/login",
    "Enter a valid email and password.",
  );
  const context = await authorizeAuthenticationAttempt("auth.login", email, "/login", 5, 60);
  const user = await one<{ id: number; password: string; role: Role }>(
    "SELECT id, password, role FROM users WHERE lower(email) = ?",
    email,
  );
  const passwordMatches = await compare(password, user?.password ?? INVALID_PASSWORD_HASH);

  if (!user || !passwordMatches) {
    await writeAuditLog({
      action: "auth.login",
      outcome: "failed",
      metadata: { reason: "invalid_credentials" },
      context,
    });
    fail("/login", "The email or password is incorrect.");
  }

  if (getRounds(user.password) < appConfig.bcryptCost) {
    await run(
      "UPDATE users SET password = ?, updated_at = ? WHERE id = ?",
      await hash(password, appConfig.bcryptCost),
      now(),
      user.id,
    );
  }

  await createSession(user.id);
  await writeAuditLog({ actorUserId: user.id, action: "auth.login", outcome: "succeeded", context });
  redirect(dashboardForRole(user.role));
}

export async function registerAction(formData: FormData) {
  const input = parseFormOrRedirect(
    registerSchema,
    formData,
    "/register",
    "Enter valid account details and a password of at least 12 characters.",
  );
  const context = await authorizeAuthenticationAttempt("auth.register", input.email, "/register", 3, 3600);

  if (await one("SELECT id FROM users WHERE lower(email) = ?", input.email)) {
    await writeAuditLog({
      action: "auth.register",
      outcome: "failed",
      metadata: { reason: "email_exists" },
      context,
    });
    fail("/register", "An account already exists for that email.");
  }

  const role: Role = input.role;
  const passwordHash = await hash(input.password, appConfig.bcryptCost);
  const userId = await transaction(async () => {
    const result = await run(
      `INSERT INTO users (name, email, password, role, phone, address, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      input.name,
      input.email,
      passwordHash,
      role,
      input.phone ?? null,
      input.address ?? null,
      now(),
      now(),
    );
    const id = Number(result.lastInsertRowid);
    if (role === "cleaner") {
      await run(
        `INSERT INTO cleaners
          (user_id, business_name, description, address, city, phone, rating, turnaround_time, opening_hours, is_available, is_approved, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, 1, 0, ?, ?)`,
        id,
        `${input.name} Laundry`,
        "Tell customers what makes your laundry service special.",
        input.address ?? "Address not set",
        "Lagos",
        input.phone ?? "Phone not set",
        "24 - 48 hours",
        "Mon - Sat, 8am - 6pm",
        now(),
        now(),
      );
    }
    await writeAuditLog({
      actorUserId: id,
      action: "auth.register",
      targetType: "user",
      targetId: id,
      outcome: "succeeded",
      metadata: { role },
      context,
    });
    return id;
  });

  await createSession(userId);
  redirect(dashboardForRole(role));
}

export async function logoutAction() {
  const { user, context } = await authorizeAction({ action: "auth.logout", rateLimit: { limit: 10, windowSeconds: 60 } });
  await writeAuditLog({ actorUserId: user.id, action: "auth.logout", outcome: "succeeded", context });
  await destroySession();
  redirect("/");
}
