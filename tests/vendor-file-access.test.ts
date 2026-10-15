import { describe, expect, test } from "vitest";
import { canAccessVendorFile } from "../src/lib/access-policy";

describe("vendor document permissions", () => {
  test("allows public branding only for public profiles", () => {
    expect(canAccessVendorFile({ kind: "logo", publicProfile: true, fileCleanerId: 1, requesterCleanerId: null, requesterRole: null })).toBe(true);
    expect(canAccessVendorFile({ kind: "cover", publicProfile: false, fileCleanerId: 1, requesterCleanerId: null, requesterRole: null })).toBe(false);
  });

  test("allows the owning vendor and admins to access restricted files", () => {
    expect(canAccessVendorFile({ kind: "identity_document", publicProfile: false, fileCleanerId: 1, requesterCleanerId: 1, requesterRole: "VENDOR_OWNER" })).toBe(true);
    expect(canAccessVendorFile({ kind: "identity_document", publicProfile: false, fileCleanerId: 1, requesterCleanerId: null, requesterRole: "ADMIN" })).toBe(true);
    expect(canAccessVendorFile({ kind: "identity_document", publicProfile: false, fileCleanerId: 1, requesterCleanerId: null, requesterRole: "SUPER_ADMIN" })).toBe(true);
  });

  test("denies other vendors, customers, and anonymous users", () => {
    expect(canAccessVendorFile({ kind: "identity_document", publicProfile: false, fileCleanerId: 1, requesterCleanerId: 2, requesterRole: "VENDOR_OWNER" })).toBe(false);
    expect(canAccessVendorFile({ kind: "identity_document", publicProfile: false, fileCleanerId: 1, requesterCleanerId: null, requesterRole: "CUSTOMER" })).toBe(false);
    expect(canAccessVendorFile({ kind: "identity_document", publicProfile: false, fileCleanerId: 1, requesterCleanerId: null, requesterRole: null })).toBe(false);
  });
});
