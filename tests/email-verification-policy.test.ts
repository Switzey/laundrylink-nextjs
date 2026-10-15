import { describe, expect, test } from "vitest";
import { emailVerificationBypassIsActive } from "../src/lib/email-verification-policy";

describe("email verification policy", () => {
  test("keeps verification required by default", () => {
    expect(emailVerificationBypassIsActive(false, false)).toBe(false);
  });

  test("allows the explicit temporary bypass when delivery is unavailable", () => {
    expect(emailVerificationBypassIsActive(true, false)).toBe(true);
  });

  test("restores provider verification automatically when delivery is configured", () => {
    expect(emailVerificationBypassIsActive(true, true)).toBe(false);
  });
});
