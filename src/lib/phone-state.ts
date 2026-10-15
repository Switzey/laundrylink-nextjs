import "server-only";

import { one, run } from "@/lib/db";
import { invalidatePhoneVerificationAttempts } from "@/lib/phone-verification-attempts";
import {
  assertSelfPhoneUpdate,
  normalizePhoneNumber,
  phoneBindingAfterChange,
  verifiedPhoneMatches,
} from "@/lib/phone-numbers";

type AccountPhoneRow = {
  phone: string | null;
  phone_verified_at: string | null;
  phone_verified_e164: string | null;
};

type BusinessPhoneRow = {
  phone: string;
  business_phone_verified_at: string | null;
  business_phone_verified_e164: string | null;
  account_phone: string | null;
  account_phone_verified_at: string | null;
  account_phone_verified_e164: string | null;
};

export function businessPhoneIsVerified(cleaner: {
  phone: string;
  business_phone_verified_at: string | null;
  business_phone_verified_e164: string | null;
}) {
  return verifiedPhoneMatches(
    cleaner.phone,
    cleaner.business_phone_verified_e164,
    cleaner.business_phone_verified_at,
  );
}

// Call inside the mutation's database transaction so profile fields and verification state move together.
export async function applyAccountPhoneChange(
  actorUserId: number,
  targetUserId: number,
  requestedPhone: string | null | undefined,
) {
  assertSelfPhoneUpdate(actorUserId, targetUserId);
  const current = await one<AccountPhoneRow>(
    "SELECT phone, phone_verified_at, phone_verified_e164 FROM users WHERE id = ?",
    targetUserId,
  );
  if (!current) throw new Error("Account not found.");
  const state = phoneBindingAfterChange(
    current.phone,
    requestedPhone,
    current.phone_verified_e164,
    current.phone_verified_at,
  );
  await run(
    "UPDATE users SET phone = ?, phone_verified_at = ?, phone_verified_e164 = ? WHERE id = ?",
    state.phone,
    state.verifiedAt,
    state.verifiedPhone,
    targetUserId,
  );
  if (state.changed) {
    await invalidatePhoneVerificationAttempts({ purpose: "account", userId: targetUserId });
  }
  return state;
}

// Business verification is retained only for the same normalized number. An exact, currently
// verified account number can supply the initial business binding; different numbers need SMS.
export async function applyBusinessPhoneChange(
  actorUserId: number,
  cleanerId: number,
  requestedPhone: string,
) {
  const current = await one<BusinessPhoneRow>(
    `SELECT c.phone, c.business_phone_verified_at, c.business_phone_verified_e164,
            u.phone AS account_phone, u.phone_verified_at AS account_phone_verified_at,
            u.phone_verified_e164 AS account_phone_verified_e164
     FROM cleaners c
     JOIN vendor_memberships vm ON vm.cleaner_id = c.id
     JOIN users u ON u.id = vm.user_id
     WHERE c.id = ? AND vm.user_id = ?`,
    cleanerId,
    actorUserId,
  );
  if (!current) throw new Error("Business phone update is not authorized.");
  const state = phoneBindingAfterChange(
    current.phone,
    requestedPhone,
    current.business_phone_verified_e164,
    current.business_phone_verified_at,
  );
  const accountPhone = normalizePhoneNumber(current.account_phone);
  const canUseAccountBinding = Boolean(
    state.phone &&
    state.phone === accountPhone &&
    verifiedPhoneMatches(
      current.account_phone,
      current.account_phone_verified_e164,
      current.account_phone_verified_at,
    ),
  );
  const verifiedAt = state.verifiedAt ?? (canUseAccountBinding ? current.account_phone_verified_at : null);
  const verifiedPhone = state.verifiedPhone ?? (canUseAccountBinding ? current.account_phone_verified_e164 : null);

  await run(
    `UPDATE cleaners SET phone = ?, business_phone_verified_at = ?, business_phone_verified_e164 = ?,
       is_available = CASE WHEN ? IS NULL THEN 0 ELSE is_available END
     WHERE id = ?`,
    state.phone,
    verifiedAt,
    verifiedPhone,
    verifiedAt,
    cleanerId,
  );
  if (state.changed) {
    await invalidatePhoneVerificationAttempts({ purpose: "vendor_business", userId: actorUserId, cleanerId });
  }
  return { ...state, verifiedAt, verifiedPhone, verified: Boolean(verifiedAt && verifiedPhone) };
}
