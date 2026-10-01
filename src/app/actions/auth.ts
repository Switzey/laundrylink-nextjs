"use server";

import { compare, getRounds, hash } from "bcryptjs";
import { redirect } from "next/navigation";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import { sendAuthEmail } from "@/lib/auth-email";
import { createAuthToken, findValidAuthToken } from "@/lib/auth-tokens";
import { authorizeAction, authorizePublicAction } from "@/lib/authorization";
import { createSession, destinationForUser, destroySession, normalizeRole } from "@/lib/auth";
import { now, one, run, transaction } from "@/lib/db";
import { appConfig, emailDeliveryConfigured, phoneVerificationConfigured } from "@/lib/env";
import { checkPhoneVerification, isE164Phone, sendPhoneVerification } from "@/lib/phone-verification";
import { RateLimitError } from "@/lib/rate-limit";
import { roleRequiresPhoneVerification, type User } from "@/lib/types";
import { emailAddress, optionalTextField, parseFormOrRedirect, strongPassword, textField } from "@/lib/validation";

const INVALID_PASSWORD_HASH = "$2b$12$fhC/QXVkKWPYGt2UA9.R3e4WGHEySkl.1vXaYPfRVKCWKc4mXljpC";

const loginSchema = z.object({ email: emailAddress, password: z.string().min(1).max(128) });
const registerSchema = z.object({
  name: textField(2, 100),
  email: emailAddress,
  password: strongPassword,
  confirm_password: z.string().min(1).max(128),
  role: z.enum(["CUSTOMER", "VENDOR_OWNER"]),
  phone: optionalTextField(30),
  address: optionalTextField(250),
}).superRefine((input, context) => {
  if (input.password !== input.confirm_password) {
    context.addIssue({ code: "custom", path: ["confirm_password"], message: "The passwords do not match." });
  }
  if (input.role === "VENDOR_OWNER" && (!input.phone || !isE164Phone(input.phone))) {
    context.addIssue({ code: "custom", path: ["phone"], message: "Enter a phone number in international format, such as +2348012345678." });
  }
});
const emailSchema = z.object({ email: emailAddress });
const resetPasswordSchema = z.object({
  token: z.string().min(40).max(100),
  password: strongPassword,
  confirm_password: z.string().min(1).max(128),
}).refine((input) => input.password === input.confirm_password, {
  path: ["confirm_password"],
  message: "The passwords do not match.",
});
const phoneSchema = z.object({
  phone: z.string().trim().refine(isE164Phone, "Enter a valid international phone number."),
});
const phoneCodeSchema = z.object({ code: z.string().trim().regex(/^\d{4,10}$/, "Enter the verification code.") });

function fail(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

async function authorizeAuthenticationAttempt(action: string, subject: string, path: string, limit: number, windowSeconds: number) {
  try {
    return await authorizePublicAction(action, subject, { limit, windowSeconds });
  } catch (error) {
    if (error instanceof RateLimitError) fail(path, `Too many attempts. Try again in ${error.retryAfterSeconds} seconds.`);
    throw error;
  }
}

export async function loginAction(formData: FormData) {
  const { email, password } = parseFormOrRedirect(loginSchema, formData, "/login", "Enter a valid email and password.");
  const context = await authorizeAuthenticationAttempt("auth.login", email, "/login", 5, 60);
  const account = await one<Omit<User, "role"> & { role: string; password: string }>(
    `SELECT id, name, email, role, phone, address, email_verified_at, phone_verified_at, password
     FROM users WHERE lower(email) = ?`,
    email,
  );
  const passwordMatches = await compare(password, account?.password ?? INVALID_PASSWORD_HASH);
  if (!account || !passwordMatches) {
    await writeAuditLog({ action: "auth.login", outcome: "failed", metadata: { reason: "invalid_credentials" }, context });
    fail("/login", "The email or password is incorrect.");
  }

  const user: User = { ...account, role: normalizeRole(account.role) };
  if (!user.email_verified_at) {
    if (emailDeliveryConfigured()) {
      const token = await createAuthToken(user.id, "email_verification", 24 * 60);
      await sendAuthEmail("verify", user, token);
    }
    await writeAuditLog({ actorUserId: user.id, action: "auth.login", outcome: "denied", metadata: { reason: "email_unverified" }, context });
    redirect("/verify-email?notice=Verify+your+email+before+signing+in.");
  }

  if (getRounds(account.password) < appConfig.bcryptCost) {
    await run("UPDATE users SET password = ?, updated_at = ? WHERE id = ?", await hash(password, appConfig.bcryptCost), now(), user.id);
  }
  await createSession(user.id);
  await writeAuditLog({ actorUserId: user.id, action: "auth.login", outcome: "succeeded", context });
  redirect(destinationForUser(user));
}

export async function registerAction(formData: FormData) {
  const input = parseFormOrRedirect(registerSchema, formData, "/register", "Enter valid account details and a password of at least 12 characters.");
  if (!emailDeliveryConfigured()) fail("/register", "Email registration is temporarily unavailable. Try Google or Apple sign-in.");
  if (input.role === "VENDOR_OWNER" && !phoneVerificationConfigured()) {
    fail("/register", "Vendor registration is temporarily unavailable while phone verification is offline.");
  }
  const context = await authorizeAuthenticationAttempt("auth.register", input.email, "/register", 3, 3600);
  if (await one("SELECT id FROM users WHERE lower(email) = ?", input.email)) {
    await writeAuditLog({ action: "auth.register", outcome: "failed", metadata: { reason: "email_exists" }, context });
    fail("/register", "An account already exists for that email.");
  }

  const passwordHash = await hash(input.password, appConfig.bcryptCost);
  const userId = await transaction(async () => {
    const timestamp = now();
    const result = await run(
      `INSERT INTO users (name, email, password, role, phone, address, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      input.name, input.email, passwordHash, input.role, input.phone ?? null, input.address ?? null, timestamp, timestamp,
    );
    const id = Number(result.lastInsertRowid);
    if (input.role === "VENDOR_OWNER") {
      const cleaner = await run(
        `INSERT INTO cleaners
          (user_id, business_name, description, address, city, phone, rating, turnaround_time, opening_hours, is_available, is_approved, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, 1, 0, ?, ?)`,
        id, `${input.name} Laundry`, "Tell customers what makes your laundry service special.", input.address ?? "Address not set",
        "Lagos", input.phone!, "24 - 48 hours", "Mon - Sat, 8am - 6pm", timestamp, timestamp,
      );
      await run(
        "INSERT INTO vendor_memberships (cleaner_id, user_id, role, created_at, updated_at) VALUES (?, ?, 'VENDOR_OWNER', ?, ?)",
        Number(cleaner.lastInsertRowid), id, timestamp, timestamp,
      );
    }
    await writeAuditLog({ actorUserId: id, action: "auth.register", targetType: "user", targetId: id, outcome: "succeeded", metadata: { role: input.role }, context });
    return id;
  });

  const token = await createAuthToken(userId, "email_verification", 24 * 60);
  const delivered = await sendAuthEmail("verify", { email: input.email, name: input.name }, token);
  redirect(delivered ? "/verify-email?sent=1" : "/verify-email?error=Your+account+was+created,+but+the+verification+email+could+not+be+sent.+Please+try+again.");
}

export async function forgotPasswordAction(formData: FormData) {
  const { email } = parseFormOrRedirect(emailSchema, formData, "/forgot-password", "Enter a valid email address.");
  const context = await authorizeAuthenticationAttempt("auth.password_forgot", email, "/forgot-password", 3, 900);
  const user = await one<{ id: number; name: string; email: string }>("SELECT id, name, email FROM users WHERE lower(email) = ?", email);
  if (user && emailDeliveryConfigured()) {
    const token = await createAuthToken(user.id, "password_reset", 30);
    const delivered = await sendAuthEmail("reset", user, token);
    await writeAuditLog({ actorUserId: user.id, action: "auth.password_reset_requested", outcome: delivered ? "succeeded" : "failed", context });
  }
  redirect("/forgot-password?sent=1");
}

export async function resetPasswordAction(formData: FormData) {
  const input = parseFormOrRedirect(resetPasswordSchema, formData, "/reset-password", "Enter a valid new password.");
  const context = await authorizeAuthenticationAttempt("auth.password_reset", input.token, "/reset-password", 5, 900);
  const record = await findValidAuthToken(input.token, "password_reset");
  if (!record) fail("/reset-password", "This reset link is invalid or expired.");
  await transaction(async () => {
    const consumed = await run("UPDATE auth_tokens SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL", now(), record.id);
    if (!consumed.changes) fail("/reset-password", "This reset link was already used.");
    await run("UPDATE users SET password = ?, updated_at = ? WHERE id = ?", await hash(input.password, appConfig.bcryptCost), now(), record.user_id);
    await run("DELETE FROM js_sessions WHERE user_id = ?", record.user_id);
    await writeAuditLog({ actorUserId: record.user_id, action: "auth.password_reset", targetType: "user", targetId: record.user_id, outcome: "succeeded", context });
  });
  redirect("/login?success=Password+reset.+Sign+in+with+your+new+password.");
}

export async function resendVerificationAction(formData: FormData) {
  const { email } = parseFormOrRedirect(emailSchema, formData, "/verify-email", "Enter a valid email address.");
  const context = await authorizeAuthenticationAttempt("auth.email_resend", email, "/verify-email", 3, 900);
  const user = await one<{ id: number; name: string; email: string; email_verified_at: string | null }>(
    "SELECT id, name, email, email_verified_at FROM users WHERE lower(email) = ?", email,
  );
  if (user && !user.email_verified_at && emailDeliveryConfigured()) {
    const token = await createAuthToken(user.id, "email_verification", 24 * 60);
    const delivered = await sendAuthEmail("verify", user, token);
    await writeAuditLog({ actorUserId: user.id, action: "auth.email_resend", outcome: delivered ? "succeeded" : "failed", context });
  }
  redirect("/verify-email?sent=1");
}

export async function sendPhoneVerificationAction(formData: FormData) {
  const { user, context } = await authorizeAction({ action: "auth.phone_send", rateLimit: { limit: 3, windowSeconds: 900 }, allowUnverified: true });
  if (!user.email_verified_at) redirect("/verify-email");
  if (!roleRequiresPhoneVerification(user.role)) redirect("/dashboard");
  if (!phoneVerificationConfigured()) fail("/verify-phone", "Phone verification is temporarily unavailable.");
  const { phone } = parseFormOrRedirect(phoneSchema, formData, "/verify-phone", "Enter a valid international phone number.");
  const delivered = await sendPhoneVerification(phone);
  if (!delivered) {
    await writeAuditLog({ actorUserId: user.id, action: "auth.phone_send", outcome: "failed", context });
    fail("/verify-phone", "We could not send a code to that number. Check it and try again.");
  }
  await run("UPDATE users SET phone = ?, phone_verified_at = NULL, updated_at = ? WHERE id = ?", phone, now(), user.id);
  await writeAuditLog({ actorUserId: user.id, action: "auth.phone_send", outcome: "succeeded", context });
  redirect("/verify-phone?sent=1");
}

export async function verifyPhoneAction(formData: FormData) {
  const { user, context } = await authorizeAction({ action: "auth.phone_verify", rateLimit: { limit: 5, windowSeconds: 900 }, allowUnverified: true });
  if (!user.email_verified_at) redirect("/verify-email");
  if (!roleRequiresPhoneVerification(user.role)) redirect("/dashboard");
  if (!user.phone || !isE164Phone(user.phone)) fail("/verify-phone", "Send a code to a valid phone number first.");
  const { code } = parseFormOrRedirect(phoneCodeSchema, formData, "/verify-phone", "Enter the verification code.");
  if (!await checkPhoneVerification(user.phone, code)) {
    await writeAuditLog({ actorUserId: user.id, action: "auth.phone_verify", outcome: "failed", context });
    fail("/verify-phone", "That code is incorrect or expired.");
  }
  await run("UPDATE users SET phone_verified_at = ?, updated_at = ? WHERE id = ?", now(), now(), user.id);
  await writeAuditLog({ actorUserId: user.id, action: "auth.phone_verify", outcome: "succeeded", context });
  redirect("/dashboard?success=Phone+verified");
}

export async function logoutAction() {
  const { user, context } = await authorizeAction({ action: "auth.logout", rateLimit: { limit: 10, windowSeconds: 60 }, allowUnverified: true });
  await writeAuditLog({ actorUserId: user.id, action: "auth.logout", outcome: "succeeded", context });
  await destroySession();
  redirect("/");
}
