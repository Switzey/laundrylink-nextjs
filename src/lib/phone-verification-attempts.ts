import "server-only";

import { now, one, run, transaction } from "@/lib/db";
import { attemptCanComplete, normalizePhoneNumber } from "@/lib/phone-numbers";
import { checkPhoneVerification, sendPhoneVerification } from "@/lib/phone-verification";

export type PhoneVerificationTarget =
  | { purpose: "account"; userId: number }
  | { purpose: "vendor_business"; userId: number; cleanerId: number };

type Attempt = {
  id: number;
  phone_e164: string;
  provider_sid: string;
  status: "pending" | "checking" | "consumed" | "invalidated" | "expired";
  expires_at: string;
};

const ATTEMPT_TTL_MS = 10 * 60 * 1000;

function cleanerId(target: PhoneVerificationTarget) {
  return target.purpose === "vendor_business" ? target.cleanerId : null;
}

async function currentTargetPhone(target: PhoneVerificationTarget) {
  if (target.purpose === "account") {
    return (await one<{ phone: string | null }>("SELECT phone FROM users WHERE id = ?", target.userId))?.phone ?? null;
  }
  return (await one<{ phone: string }>(
    `SELECT c.phone FROM cleaners c
     JOIN vendor_memberships vm ON vm.cleaner_id = c.id
     WHERE c.id = ? AND vm.user_id = ?`,
    target.cleanerId,
    target.userId,
  ))?.phone ?? null;
}

async function invalidateOpenAttempts(target: PhoneVerificationTarget) {
  await run(
    `UPDATE phone_verification_attempts SET status = 'invalidated', updated_at = ?
     WHERE user_id = ? AND purpose = ? AND cleaner_id IS ? AND status IN ('pending', 'checking')`,
    now(),
    target.userId,
    target.purpose,
    cleanerId(target),
  );
}

export async function invalidatePhoneVerificationAttempts(target: PhoneVerificationTarget) {
  await invalidateOpenAttempts(target);
}

export async function beginPhoneVerification(target: PhoneVerificationTarget) {
  const phone = normalizePhoneNumber(await currentTargetPhone(target));
  if (!phone) return { status: "invalid_phone" as const };
  const delivery = await sendPhoneVerification(phone);
  if (!delivery) return { status: "delivery_failed" as const };

  const expiresAt = new Date(Date.now() + ATTEMPT_TTL_MS).toISOString();
  const stored = await transaction(async () => {
    if (normalizePhoneNumber(await currentTargetPhone(target)) !== phone) return false;
    await invalidateOpenAttempts(target);
    await run(
      `INSERT INTO phone_verification_attempts
        (user_id, cleaner_id, purpose, phone_e164, provider_sid, status, expires_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
      target.userId,
      cleanerId(target),
      target.purpose,
      phone,
      delivery.sid,
      expiresAt,
      now(),
      now(),
    );
    return true;
  });
  return stored ? { status: "sent" as const, phone } : { status: "target_changed" as const };
}

async function claimAttempt(target: PhoneVerificationTarget) {
  return transaction(async () => {
    const timestamp = new Date().toISOString();
    await run(
      `UPDATE phone_verification_attempts SET status = 'expired', updated_at = ?
       WHERE user_id = ? AND purpose = ? AND cleaner_id IS ?
         AND status IN ('pending', 'checking') AND expires_at <= ?`,
      now(), target.userId, target.purpose, cleanerId(target), timestamp,
    );
    const phone = normalizePhoneNumber(await currentTargetPhone(target));
    if (!phone) return null;
    const attempt = await one<Attempt>(
      `SELECT id, phone_e164, provider_sid, status, expires_at
       FROM phone_verification_attempts
       WHERE user_id = ? AND purpose = ? AND cleaner_id IS ? AND phone_e164 = ?
         AND status = 'pending' AND expires_at > ?
       ORDER BY id DESC LIMIT 1`,
      target.userId, target.purpose, cleanerId(target), phone, timestamp,
    );
    if (!attempt) return null;
    const claimed = await run(
      "UPDATE phone_verification_attempts SET status = 'checking', updated_at = ? WHERE id = ? AND status = 'pending'",
      now(), attempt.id,
    );
    return claimed.changes ? { ...attempt, status: "checking" as const } : null;
  });
}

async function releaseFailedAttempt(attempt: Attempt) {
  const timestamp = new Date().toISOString();
  await run(
    `UPDATE phone_verification_attempts
     SET status = CASE WHEN expires_at <= ? THEN 'expired' ELSE 'pending' END, updated_at = ?
     WHERE id = ? AND status = 'checking'`,
    timestamp, now(), attempt.id,
  );
}

export async function completePhoneVerification(target: PhoneVerificationTarget, code: string) {
  const attempt = await claimAttempt(target);
  if (!attempt) return { status: "missing_or_expired" as const };

  const providerResult = await checkPhoneVerification(attempt.phone_e164, code);
  if (!providerResult.approved || providerResult.sid !== attempt.provider_sid) {
    await releaseFailedAttempt(attempt);
    return { status: "invalid_code" as const };
  }

  const verifiedAt = now();
  const completed = await transaction(async () => {
    const currentPhone = await currentTargetPhone(target);
    const fresh = await one<Attempt>(
      "SELECT id, phone_e164, provider_sid, status, expires_at FROM phone_verification_attempts WHERE id = ?",
      attempt.id,
    );
    if (!fresh || !attemptCanComplete({
      phone: fresh.phone_e164,
      providerSid: fresh.provider_sid,
      status: fresh.status,
      expiresAt: fresh.expires_at,
    }, currentPhone, providerResult.sid, new Date())) {
      if (fresh?.status === "checking") {
        await run("UPDATE phone_verification_attempts SET status = 'invalidated', updated_at = ? WHERE id = ?", now(), attempt.id);
      }
      return false;
    }

    if (target.purpose === "account") {
      const updated = await run(
        `UPDATE users SET phone_verified_at = ?, phone_verified_e164 = ?, updated_at = ?
         WHERE id = ? AND phone = ?`,
        verifiedAt, fresh.phone_e164, now(), target.userId, fresh.phone_e164,
      );
      if (!updated.changes) {
        await run("UPDATE phone_verification_attempts SET status = 'invalidated', updated_at = ? WHERE id = ?", now(), attempt.id);
        return false;
      }
      await run(
        `UPDATE cleaners SET business_phone_verified_at = ?, business_phone_verified_e164 = ?, updated_at = ?
         WHERE user_id = ? AND phone = ?`,
        verifiedAt, fresh.phone_e164, now(), target.userId, fresh.phone_e164,
      );
    } else {
      const updated = await run(
        `UPDATE cleaners SET business_phone_verified_at = ?, business_phone_verified_e164 = ?, updated_at = ?
         WHERE id = ? AND phone = ?`,
        verifiedAt, fresh.phone_e164, now(), target.cleanerId, fresh.phone_e164,
      );
      if (!updated.changes) {
        await run("UPDATE phone_verification_attempts SET status = 'invalidated', updated_at = ? WHERE id = ?", now(), attempt.id);
        return false;
      }
    }
    await run(
      "UPDATE phone_verification_attempts SET status = 'consumed', consumed_at = ?, updated_at = ? WHERE id = ? AND status = 'checking'",
      verifiedAt, now(), attempt.id,
    );
    return true;
  });

  return completed
    ? { status: "approved" as const, phone: attempt.phone_e164, verifiedAt }
    : { status: "target_changed" as const };
}
