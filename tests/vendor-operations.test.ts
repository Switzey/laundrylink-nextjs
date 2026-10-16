import assert from "node:assert/strict";
import { test } from "vitest";
import { canAdvanceProductionStage, canManageVendor, canUpdateProductionStage, vendorNetRevenue } from "../src/lib/vendor-operations";

test("only vendor management roles receive full business controls", () => {
  assert.equal(canManageVendor("VENDOR_OWNER"), true);
  assert.equal(canManageVendor("VENDOR_MANAGER"), true);
  assert.equal(canManageVendor("VENDOR_STAFF"), false);
  assert.equal(canManageVendor("CUSTOMER"), false);
});

test("production responsibilities restrict staff stage updates", () => {
  assert.equal(canUpdateProductionStage("VENDOR_STAFF", "cleaner", "washing"), true);
  assert.equal(canUpdateProductionStage("VENDOR_STAFF", "cleaner", "inspection"), false);
  assert.equal(canUpdateProductionStage("VENDOR_STAFF", "quality_inspector", "inspection"), true);
  assert.equal(canUpdateProductionStage("VENDOR_STAFF", "dispatcher", "washing"), false);
  assert.equal(canUpdateProductionStage("VENDOR_OWNER", null, "ready"), true);
});

test("production stages cannot skip ahead or move backwards", () => {
  assert.equal(canAdvanceProductionStage("received", "washing"), true);
  assert.equal(canAdvanceProductionStage("washing", "washing"), true);
  assert.equal(canAdvanceProductionStage("washing", "inspection"), false);
  assert.equal(canAdvanceProductionStage("packaging", "inspection"), false);
});

test("vendor revenue deducts marketplace commission and adjustments", () => {
  assert.deepEqual(vendorNetRevenue(100_000, 10, 5_000), { commission: 10_000, net: 85_000 });
});
