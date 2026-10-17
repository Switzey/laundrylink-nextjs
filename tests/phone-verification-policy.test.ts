import { describe, expect, test } from "vitest";
import { developmentPhoneVerificationCode } from "../src/lib/phone-verification-policy";

describe("development phone verification policy", () => {
  test("uses the local default only in development without a provider", () => {
    expect(developmentPhoneVerificationCode("development", null, false)).toBe("12345");
  });

  test("accepts a configured numeric development code", () => {
    expect(developmentPhoneVerificationCode("development", "654321", false)).toBe("654321");
  });

  test("rejects malformed development codes", () => {
    expect(developmentPhoneVerificationCode("development", "password", false)).toBeNull();
  });

  test.each(["staging", "production"] as const)("never enables a fixed code in %s", (environment) => {
    expect(developmentPhoneVerificationCode(environment, "12345", false)).toBeNull();
  });

  test("prefers the configured SMS provider", () => {
    expect(developmentPhoneVerificationCode("development", "12345", true)).toBeNull();
  });
});
