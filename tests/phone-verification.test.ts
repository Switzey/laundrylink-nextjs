import assert from "node:assert/strict";
import { test } from "vitest";
import {
  assertSelfPhoneUpdate,
  attemptCanComplete,
  normalizePhoneNumber,
  phoneBindingAfterChange,
  verifiedPhoneMatches,
} from "../src/lib/phone-numbers";

const verifiedAt = "2026-10-13T08:00:00.000Z";
const accountPhone = "+2348012345678";

test("changing a verified phone resets its exact-number binding", () => {
  const result = phoneBindingAfterChange(accountPhone, "+2348098765432", accountPhone, verifiedAt);
  assert.equal(result.changed, true);
  assert.equal(result.verifiedAt, null);
  assert.equal(result.verifiedPhone, null);
});

test("unchanged normalized phone retains verification", () => {
  const result = phoneBindingAfterChange("0801 234 5678", "+234 801 234 5678", accountPhone, verifiedAt);
  assert.equal(result.changed, false);
  assert.equal(result.phone, accountPhone);
  assert.equal(result.verifiedAt, verifiedAt);
  assert.equal(result.verifiedPhone, accountPhone);
});

test("Nigerian local and international inputs normalize to E.164", () => {
  assert.equal(normalizePhoneNumber("0801 234 5678"), accountPhone);
  assert.equal(normalizePhoneNumber("+234 (801) 234-5678"), accountPhone);
  assert.equal(normalizePhoneNumber("not-a-phone"), null);
});

test("an attempt for an old number cannot verify a replacement number", () => {
  assert.equal(attemptCanComplete({
    phone: accountPhone,
    providerSid: "VE-old-attempt",
    status: "checking",
    expiresAt: "2026-10-13T08:10:00.000Z",
  }, "+2348098765432", "VE-old-attempt", new Date("2026-10-13T08:05:00.000Z")), false);
});

test("a provider result must belong to the exact send attempt", () => {
  assert.equal(attemptCanComplete({
    phone: accountPhone,
    providerSid: "VE-current-attempt",
    status: "checking",
    expiresAt: "2026-10-13T08:10:00.000Z",
  }, accountPhone, "VE-older-attempt", new Date("2026-10-13T08:05:00.000Z")), false);
});

test("expired and consumed attempts cannot verify", () => {
  const attempt = {
    phone: accountPhone,
    providerSid: "VE-current-attempt",
    status: "checking" as const,
    expiresAt: "2026-10-13T08:10:00.000Z",
  };
  assert.equal(attemptCanComplete(attempt, accountPhone, attempt.providerSid, new Date("2026-10-13T08:10:00.000Z")), false);
  assert.equal(attemptCanComplete({ ...attempt, status: "consumed" }, accountPhone, attempt.providerSid, new Date("2026-10-13T08:05:00.000Z")), false);
});

test("unauthorized account phone changes fail", () => {
  assert.throws(() => assertSelfPhoneUpdate(7, 8), /not authorized/i);
  assert.doesNotThrow(() => assertSelfPhoneUpdate(7, 7));
});

test("a different vendor business phone requires its own exact verification", () => {
  const businessPhone = "+2348098765432";
  assert.equal(verifiedPhoneMatches(businessPhone, accountPhone, verifiedAt), false);
  assert.equal(verifiedPhoneMatches(businessPhone, businessPhone, verifiedAt), true);
  const retained = phoneBindingAfterChange("0809 876 5432", businessPhone, businessPhone, verifiedAt);
  assert.equal(retained.changed, false);
  assert.equal(retained.verifiedAt, verifiedAt);
});

test("phone transitions do not mutate unrelated session state", () => {
  const session = Object.freeze({ tokenHash: "session-token-hash", expiresAt: "2026-10-20T08:00:00.000Z" });
  phoneBindingAfterChange(accountPhone, "+2348098765432", accountPhone, verifiedAt);
  assert.deepEqual(session, { tokenHash: "session-token-hash", expiresAt: "2026-10-20T08:00:00.000Z" });
});
