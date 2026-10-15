import { parsePhoneNumberFromString } from "libphonenumber-js";

const DEFAULT_PHONE_COUNTRY = "NG";

export function normalizePhoneNumber(value: string | null | undefined) {
  const candidate = value?.trim();
  if (!candidate) return null;
  const phone = parsePhoneNumberFromString(candidate, DEFAULT_PHONE_COUNTRY);
  return phone?.isValid() ? phone.number : null;
}

export function isE164Phone(value: string) {
  return normalizePhoneNumber(value) === value;
}

export function verifiedPhoneMatches(
  phone: string | null | undefined,
  verifiedPhone: string | null | undefined,
  verifiedAt: string | null | undefined,
) {
  const normalized = normalizePhoneNumber(phone);
  return Boolean(verifiedAt && normalized && normalized === verifiedPhone);
}

export function phoneBindingAfterChange(
  currentPhone: string | null | undefined,
  requestedPhone: string | null | undefined,
  verifiedPhone: string | null | undefined,
  verifiedAt: string | null | undefined,
) {
  const current = normalizePhoneNumber(currentPhone);
  const requested = normalizePhoneNumber(requestedPhone);
  if (requestedPhone?.trim() && !requested) throw new Error("Enter a valid international phone number.");
  const changed = current !== requested;
  const remainsVerified = Boolean(!changed && requested && requested === verifiedPhone && verifiedAt);
  return {
    changed,
    phone: requested,
    verifiedPhone: remainsVerified ? verifiedPhone ?? null : null,
    verifiedAt: remainsVerified ? verifiedAt ?? null : null,
  };
}

export function assertSelfPhoneUpdate(actorUserId: number, targetUserId: number) {
  if (actorUserId !== targetUserId) throw new Error("Phone update is not authorized.");
}

export type VerificationAttemptSnapshot = {
  phone: string;
  providerSid: string;
  status: "pending" | "checking" | "consumed" | "invalidated" | "expired";
  expiresAt: string;
};

export function attemptCanComplete(
  attempt: VerificationAttemptSnapshot,
  targetPhone: string | null | undefined,
  providerSid: string | null | undefined,
  at: Date,
) {
  return attempt.status === "checking" &&
    attempt.phone === normalizePhoneNumber(targetPhone) &&
    attempt.providerSid === providerSid &&
    new Date(attempt.expiresAt).getTime() > at.getTime();
}
