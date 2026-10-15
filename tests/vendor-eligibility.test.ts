import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, beforeEach, test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import {
  showPublicBookingAction,
  type VendorEligibility,
} from "../src/lib/vendor-eligibility-model";

type EligibilityRow = {
  cleaner_id: number;
  business_complete: number;
  location_valid: number;
  verification_complete: number;
  admin_approved: number;
  active_service_count: number;
  is_published: number;
  is_accepting_orders: number;
  is_suspended: number;
  publication_eligible: number;
  public_profile: number;
  booking_requirements_met: number;
  bookable: number;
};

const directory = mkdtempSync(path.join(tmpdir(), "laundrylink-vendor-test-"));
const databasePath = path.join(directory, "laundrylink.sqlite");
const setup = spawnSync(process.execPath, ["scripts/setup-database.mjs"], {
  cwd: process.cwd(),
  env: { ...process.env, DATABASE_PATH: databasePath, TURSO_DATABASE_URL: "", TURSO_AUTH_TOKEN: "" },
  encoding: "utf8",
});
assert.equal(setup.status, 0, setup.stderr || setup.stdout);
const database = new DatabaseSync(databasePath);
const cleaner = database.prepare("SELECT id, user_id FROM cleaners LIMIT 1").get() as { id: number; user_id: number };

function eligibility() {
  return database.prepare("SELECT * FROM vendor_eligibility WHERE cleaner_id = ?").get(cleaner.id) as EligibilityRow;
}

function model(row: EligibilityRow): VendorEligibility {
  return {
    cleanerId: row.cleaner_id,
    businessComplete: row.business_complete === 1,
    locationValid: row.location_valid === 1,
    verificationComplete: row.verification_complete === 1,
    adminApproved: row.admin_approved === 1,
    activeServiceCount: row.active_service_count,
    isPublished: row.is_published === 1,
    isAcceptingOrders: row.is_accepting_orders === 1,
    isSuspended: row.is_suspended === 1,
    publicationEligible: row.publication_eligible === 1,
    publicProfile: row.public_profile === 1,
    bookingRequirementsMet: row.booking_requirements_met === 1,
    bookable: row.bookable === 1,
  };
}

beforeEach(() => {
  database.prepare("DELETE FROM order_items").run();
  database.prepare("DELETE FROM orders").run();
  database.prepare(
    `UPDATE users SET phone = '+2348030000001', phone_verified_at = ?,
       phone_verified_e164 = '+2348030000001' WHERE id = ?`,
  ).run("2026-10-13 08:00:00", cleaner.user_id);
  database.prepare(
    `UPDATE cleaners SET phone = '+2348030000001', business_phone_verified_at = ?,
       business_phone_verified_e164 = '+2348030000001', verification_status = 'approved',
       is_approved = 1, is_published = 1, is_suspended = 0, is_available = 1 WHERE id = ?`,
  ).run("2026-10-13 08:00:00", cleaner.id);
  database.prepare("UPDATE services SET is_active = 1, price = 1200 WHERE cleaner_id = ?").run(cleaner.id);
});

after(() => {
  database.close();
  rmSync(directory, { recursive: true, force: true });
});

test("inactive services do not count as active services", () => {
  database.prepare("UPDATE services SET is_active = 0 WHERE cleaner_id = ?").run(cleaner.id);
  assert.equal(eligibility().active_service_count, 0);
});

test("vendor with zero active services cannot become bookable", () => {
  database.prepare("UPDATE services SET is_active = 0 WHERE cleaner_id = ?").run(cleaner.id);
  assert.equal(eligibility().bookable, 0);
});

test("vendor with incomplete verification cannot become bookable", () => {
  database.prepare(
    "UPDATE cleaners SET is_available = 0, business_phone_verified_at = NULL, business_phone_verified_e164 = NULL WHERE id = ?",
  ).run(cleaner.id);
  const state = eligibility();
  assert.equal(state.verification_complete, 0);
  assert.equal(state.bookable, 0);
});

test("suspended vendor cannot accept new orders", () => {
  database.prepare("UPDATE cleaners SET is_suspended = 1, is_available = 0 WHERE id = ?").run(cleaner.id);
  const state = eligibility();
  assert.equal(state.is_suspended, 1);
  assert.equal(state.bookable, 0);
});

test("paused vendor cannot accept new orders", () => {
  database.prepare("UPDATE cleaners SET is_available = 0 WHERE id = ?").run(cleaner.id);
  const state = eligibility();
  assert.equal(state.public_profile, 1);
  assert.equal(state.bookable, 0);
});

test("active eligible vendor can accept orders", () => {
  const state = eligibility();
  assert.equal(state.business_complete, 1);
  assert.equal(state.location_valid, 1);
  assert.equal(state.verification_complete, 1);
  assert.equal(state.active_service_count > 0, true);
  assert.equal(state.bookable, 1);
});

test("public booking UI follows the server-side eligibility result", () => {
  let state = eligibility();
  assert.equal(showPublicBookingAction(model(state)), Boolean(state.bookable));
  database.prepare("UPDATE cleaners SET is_available = 0 WHERE id = ?").run(cleaner.id);
  state = eligibility();
  assert.equal(showPublicBookingAction(model(state)), false);
  assert.equal(showPublicBookingAction(model(state)), Boolean(state.bookable));
});

test("existing orders remain intact after vendor suspension", () => {
  const customer = database.prepare("SELECT id FROM users WHERE email = 'customer@example.com'").get() as { id: number };
  database.prepare(
    `INSERT INTO orders
      (customer_id, cleaner_id, status, subtotal, delivery_fee, platform_fee, total,
       payment_status, created_at, updated_at)
     VALUES (?, ?, 'accepted', 1200, 500, 100, 1800, 'unpaid', ?, ?)`,
  ).run(customer.id, cleaner.id, "2026-10-13 08:00:00", "2026-10-13 08:00:00");
  database.prepare("UPDATE cleaners SET is_suspended = 1, is_available = 0 WHERE id = ?").run(cleaner.id);
  const orders = database.prepare("SELECT COUNT(1) AS count FROM orders WHERE cleaner_id = ?").get(cleaner.id) as { count: number };
  assert.equal(orders.count, 1);
  assert.equal(eligibility().bookable, 0);
});
