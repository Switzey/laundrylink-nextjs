import { describe, expect, test } from "vitest";
import { developmentPhoneVerificationCode, phoneVerificationGateIsActive } from "../src/lib/phone-verification-policy";

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

describe("phone verification access gate", () => {
  test("does not block access while verification delivery is unavailable", () => {
    expect(phoneVerificationGateIsActive(true, false, false)).toBe(false);
  });

  test("requires verification when the provider is available", () => {
    expect(phoneVerificationGateIsActive(true, false, true)).toBe(true);
  });

  test("does not block verified phones or roles without the requirement", () => {
    expect(phoneVerificationGateIsActive(true, true, true)).toBe(false);
    expect(phoneVerificationGateIsActive(false, false, true)).toBe(false);
  });
});
