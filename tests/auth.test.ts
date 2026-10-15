import { describe, expect, test } from "vitest";
import { loginSchema, registerSchema, resetPasswordSchema } from "../src/lib/auth-validation";
import { sanitizeReturnTo } from "../src/lib/auth-intent";
import { roleIsAllowed } from "../src/lib/access-policy";

describe("authentication validation", () => {
  test("accepts a normalized customer registration", () => {
    const result = registerSchema.parse({
      name: "Tola Martins",
      email: " TOLA@example.com ",
      password: "correct-horse-battery-staple",
      confirm_password: "correct-horse-battery-staple",
      role: "CUSTOMER",
      phone: "",
      address: "14 Admiralty Way",
    });
    expect(result.email).toBe("tola@example.com");
  });

  test.each([
    ["short password", { password: "too-short", confirm_password: "too-short" }],
    ["mismatched passwords", { password: "correct-horse-battery-staple", confirm_password: "different-password-value" }],
    ["missing vendor phone", { password: "correct-horse-battery-staple", confirm_password: "correct-horse-battery-staple", role: "VENDOR_OWNER" }],
  ])("rejects registration with %s", (_label, override) => {
    const result = registerSchema.safeParse({
      name: "Vendor Owner",
      email: "vendor@example.com",
      role: "CUSTOMER",
      phone: "",
      ...override,
    });
    expect(result.success).toBe(false);
  });

  test("validates login and reset payloads without exposing password values", () => {
    expect(loginSchema.safeParse({ email: "not-an-email", password: "secret" }).success).toBe(false);
    expect(resetPasswordSchema.safeParse({ token: "a".repeat(40), password: "a".repeat(12), confirm_password: "b".repeat(12) }).success).toBe(false);
  });
});

describe("authorization and return intent", () => {
  test("enforces role membership", () => {
    expect(roleIsAllowed("ADMIN", ["ADMIN", "SUPER_ADMIN"])).toBe(true);
    expect(roleIsAllowed("CUSTOMER", ["ADMIN", "SUPER_ADMIN"])).toBe(false);
    expect(roleIsAllowed("CUSTOMER")).toBe(true);
  });

  test("preserves a safe checkout return URL", () => {
    expect(sanitizeReturnTo("/orders/new?cleaner=1&resume=1")).toBe("/orders/new?cleaner=1&resume=1");
  });

  test.each([
    "https://attacker.example/steal",
    "//attacker.example/steal",
    "/api/oauth/callback",
    "/login",
    "/orders\\new",
  ])("rejects unsafe return URL %s", (returnTo) => {
    expect(sanitizeReturnTo(returnTo)).toBeNull();
  });
});
