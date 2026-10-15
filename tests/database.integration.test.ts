import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterAll, beforeEach, describe, test } from "vitest";

const directory = mkdtempSync(path.join(tmpdir(), "laundrylink-integration-test-"));
const databasePath = path.join(directory, "laundrylink.sqlite");
const setup = spawnSync(process.execPath, ["scripts/setup-database.mjs"], {
  cwd: process.cwd(),
  env: { ...process.env, DATABASE_PATH: databasePath, TURSO_DATABASE_URL: "", TURSO_AUTH_TOKEN: "" },
  encoding: "utf8",
});
assert.equal(setup.status, 0, setup.stderr || setup.stdout);
const database = new DatabaseSync(databasePath);
database.exec("PRAGMA foreign_keys = ON");

const customer = database.prepare("SELECT id FROM users WHERE email = 'customer@example.com'").get() as { id: number };
const vendor = database.prepare("SELECT id FROM users WHERE email = 'cleaner@example.com'").get() as { id: number };
const cleaner = database.prepare("SELECT id FROM cleaners WHERE user_id = ?").get(vendor.id) as { id: number };
const service = database.prepare("SELECT id, price FROM services WHERE cleaner_id = ? ORDER BY id LIMIT 1").get(cleaner.id) as { id: number; price: number };

function seedOrder(status = "pending") {
  const timestamp = new Date().toISOString();
  const result = database.prepare(`INSERT INTO orders
    (customer_id, cleaner_id, pickup_address, delivery_address, pickup_date, pickup_time_window,
     status, subtotal, delivery_fee, platform_fee, total, payment_status, created_at, updated_at)
    VALUES (?, ?, 'Customer pickup', 'Customer delivery', '2026-11-10', '8am - 10am', ?, ?, 1500, 500, ?, 'unpaid', ?, ?)`)
    .run(customer.id, cleaner.id, status, service.price, Number(service.price) + 2000, timestamp, timestamp);
  return Number(result.lastInsertRowid);
}

beforeEach(() => {
  database.exec("DELETE FROM reviews; DELETE FROM order_items; DELETE FROM order_activities; DELETE FROM orders; DELETE FROM js_sessions; DELETE FROM audit_logs;");
  database.prepare("UPDATE cleaners SET is_suspended = 0, is_available = 1, is_approved = 1, is_published = 1, verification_status = 'approved' WHERE id = ?").run(cleaner.id);
});

afterAll(() => {
  database.close();
  rmSync(directory, { recursive: true, force: true });
});

describe("database constraints", () => {
  test("enforces unique normalized emails and valid service prices", () => {
    assert.throws(() => database.prepare(`INSERT INTO users
      (name, email, password, role, created_at, updated_at) VALUES ('Duplicate User', 'CUSTOMER@example.com', ?, 'CUSTOMER', ?, ?)`)
      .run("x".repeat(60), new Date().toISOString(), new Date().toISOString()), /invalid email|unique/i);
    assert.throws(() => database.prepare("UPDATE services SET price = 0 WHERE id = ?").run(service.id), /invalid service price/i);
  });

  test("enforces order quantities, amounts, review ratings, and one review per order", () => {
    const orderId = seedOrder("completed");
    assert.throws(() => database.prepare("INSERT INTO order_items (order_id, service_id, quantity, price) VALUES (?, ?, 0, ?)").run(orderId, service.id, service.price), /invalid order item/i);
    assert.throws(() => database.prepare("UPDATE orders SET total = -1 WHERE id = ?").run(orderId), /invalid order amount/i);
    assert.throws(() => database.prepare("INSERT INTO reviews (order_id, customer_id, cleaner_id, rating) VALUES (?, ?, ?, 6)").run(orderId, customer.id, cleaner.id), /invalid review rating/i);
    database.prepare("INSERT INTO reviews (order_id, customer_id, cleaner_id, rating) VALUES (?, ?, ?, 5)").run(orderId, customer.id, cleaner.id);
    assert.throws(() => database.prepare("INSERT INTO reviews (order_id, customer_id, cleaner_id, rating) VALUES (?, ?, ?, 4)").run(orderId, customer.id, cleaner.id), /unique/i);
  });

  test("expires old sessions while preserving active sessions", () => {
    const past = "2026-01-01T01:00:00.000Z";
    const future = "2099-01-01T01:00:00.000Z";
    database.prepare("INSERT INTO js_sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)").run("a".repeat(64), customer.id, past, "2025-12-01T01:00:00.000Z");
    database.prepare("INSERT INTO js_sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)").run("b".repeat(64), customer.id, future, "2026-01-01T01:00:00.000Z");
    database.prepare("DELETE FROM js_sessions WHERE expires_at <= ?").run(new Date().toISOString());
    const active = database.prepare("SELECT token_hash FROM js_sessions").get() as { token_hash: string };
    assert.equal(active.token_hash, "b".repeat(64));
  });
});

describe("ownership, audit history, and vendor safety", () => {
  test("scopes saved addresses to their account owner", () => {
    const address = database.prepare("SELECT id FROM addresses WHERE user_id = ? LIMIT 1").get(customer.id) as { id: number };
    assert.ok(database.prepare("SELECT id FROM addresses WHERE id = ? AND user_id = ?").get(address.id, customer.id));
    assert.equal(database.prepare("SELECT id FROM addresses WHERE id = ? AND user_id = ?").get(address.id, vendor.id), undefined);
  });

  test("preserves existing orders when a vendor is suspended", () => {
    seedOrder();
    database.prepare("UPDATE cleaners SET is_suspended = 1, is_available = 0 WHERE id = ?").run(cleaner.id);
    assert.equal((database.prepare("SELECT COUNT(*) AS count FROM orders WHERE cleaner_id = ?").get(cleaner.id) as { count: number }).count, 1);
    assert.equal((database.prepare("SELECT bookable FROM vendor_eligibility WHERE cleaner_id = ?").get(cleaner.id) as { bookable: number }).bookable, 0);
  });

  test("stores constrained audit and order activity records", () => {
    const orderId = seedOrder();
    const timestamp = new Date().toISOString();
    database.prepare("INSERT INTO order_activities (order_id, user_id, action, description, created_at, updated_at) VALUES (?, ?, 'order_status_updated', 'Order accepted.', ?, ?)").run(orderId, vendor.id, timestamp, timestamp);
    database.prepare("INSERT INTO audit_logs (actor_user_id, action, target_type, target_id, outcome, request_id, ip_hash, metadata, created_at) VALUES (?, 'order.status_update', 'order', ?, 'succeeded', 'integration-test', ?, ?, ?)")
      .run(vendor.id, String(orderId), "f".repeat(64), JSON.stringify({ from: "pending", to: "accepted" }), timestamp);
    assert.equal((database.prepare("SELECT COUNT(*) AS count FROM order_activities WHERE order_id = ?").get(orderId) as { count: number }).count, 1);
    assert.equal((database.prepare("SELECT outcome FROM audit_logs WHERE target_id = ?").get(String(orderId)) as { outcome: string }).outcome, "succeeded");
  });
});
