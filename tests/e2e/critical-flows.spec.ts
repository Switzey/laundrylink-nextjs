import { createHash } from "node:crypto";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { expect, test, type Page } from "@playwright/test";

const databasePath = path.resolve("data/e2e.sqlite");
const password = "e2e-test-password";

function withDatabase<T>(callback: (database: DatabaseSync) => T) {
  const database = new DatabaseSync(databasePath);
  try {
    database.exec("PRAGMA foreign_keys = ON");
    return callback(database);
  } finally {
    database.close();
  }
}

function records() {
  return withDatabase((database) => ({
    admin: database.prepare("SELECT id FROM users WHERE email = 'admin@example.com'").get() as { id: number },
    customer: database.prepare("SELECT id FROM users WHERE email = 'customer@example.com'").get() as { id: number },
    vendor: database.prepare("SELECT id FROM users WHERE email = 'cleaner@example.com'").get() as { id: number },
    cleaner: database.prepare("SELECT id FROM cleaners WHERE user_id = (SELECT id FROM users WHERE email = 'cleaner@example.com')").get() as { id: number },
    service: database.prepare("SELECT id, price FROM services WHERE name = 'Shirt Laundry'").get() as { id: number; price: number },
  }));
}

function resetState() {
  const ids = records();
  withDatabase((database) => {
    database.exec(`
      DELETE FROM reviews;
      DELETE FROM order_items;
      DELETE FROM order_activities;
      DELETE FROM orders;
      DELETE FROM audit_logs;
      DELETE FROM rate_limits;
      DELETE FROM js_sessions;
    `);
    database.prepare(`UPDATE cleaners SET
      verification_status = 'approved', is_approved = 1, is_published = 1,
      is_suspended = 0, is_available = 1, approved_at = ?, updated_at = ?
      WHERE id = ?`).run(new Date().toISOString(), new Date().toISOString(), ids.cleaner.id);
    database.prepare("UPDATE services SET is_active = 1 WHERE cleaner_id = ?").run(ids.cleaner.id);
  });
}

function seedOrder(status = "pending") {
  const ids = records();
  return withDatabase((database) => {
    const timestamp = new Date().toISOString();
    const result = database.prepare(`INSERT INTO orders
      (customer_id, cleaner_id, pickup_address, delivery_address, pickup_date, pickup_time_window,
       delivery_date, delivery_time_window, status, subtotal, delivery_fee, platform_fee, total,
       payment_status, created_at, updated_at)
      VALUES (?, ?, '14 Admiralty Way, Lekki, Lagos', '14 Admiralty Way, Lekki, Lagos',
       '2026-11-10', '8am - 10am', '2026-11-12', '10am - 12pm', ?, ?, 1500, 500, ?,
       'unpaid', ?, ?)`)
      .run(ids.customer.id, ids.cleaner.id, status, ids.service.price, Number(ids.service.price) + 2000, timestamp, timestamp);
    const orderId = Number(result.lastInsertRowid);
    database.prepare("INSERT INTO order_items (order_id, service_id, quantity, price, created_at, updated_at) VALUES (?, ?, 1, ?, ?, ?)")
      .run(orderId, ids.service.id, ids.service.price, timestamp, timestamp);
    database.prepare("INSERT INTO order_activities (order_id, user_id, action, description, created_at, updated_at) VALUES (?, ?, 'order_created', 'Order created for browser testing.', ?, ?)")
      .run(orderId, ids.customer.id, timestamp, timestamp);
    if (status !== "pending") {
      database.prepare("INSERT INTO order_activities (order_id, user_id, action, description, metadata, created_at, updated_at) VALUES (?, ?, 'order_status_updated', 'FreshFold Laundry accepted the order.', ?, ?, ?)")
        .run(orderId, ids.vendor.id, JSON.stringify({ from: "pending", to: status }), timestamp, timestamp);
    }
    return orderId;
  });
}

async function login(page: Page, email: string, expectedPath: RegExp = /\/dashboard/) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(expectedPath);
}

function futureDate(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

test.beforeEach(() => resetState());

test("customer can register and sign in through the temporary email bypass", async ({ page }) => {
  const email = `qa-registration-${Date.now()}@example.com`;
  await page.goto("/register");
  await page.getByLabel("Full name").fill("QA Registration Customer");
  await page.getByLabel("Email").fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('input[name="confirm_password"]').fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/login\?success=/);
  await expect(page.getByText("Account created. You can sign in now.")).toBeVisible();

  await page.getByLabel("Email").fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/customer\/dashboard/);

  const registered = withDatabase((database) => database
    .prepare("SELECT email_verified_at FROM users WHERE email = ?")
    .get(email)) as { email_verified_at: string | null };
  expect(registered.email_verified_at).toBeTruthy();
});

test("customer account login uses an HTTP-only session and logout revokes it", async ({ page, context }) => {
  await login(page, "customer@example.com", /\/customer\/dashboard/);
  await expect(page.getByRole("heading", { name: /Good to see you, Tola/i })).toBeVisible();
  const session = (await context.cookies()).find((cookie) => cookie.name === "laundrylink_session");
  expect(session?.httpOnly).toBe(true);
  expect(session?.sameSite).toBe("Lax");

  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL("/");
  expect((await context.cookies()).some((cookie) => cookie.name === "laundrylink_session")).toBe(false);
});

test("expired sessions return to login with a safe expiration message", async ({ page, context }) => {
  await login(page, "customer@example.com", /\/customer\/dashboard/);
  const token = (await context.cookies()).find((cookie) => cookie.name === "laundrylink_session")?.value;
  expect(token).toBeTruthy();
  withDatabase((database) => {
    database.prepare("UPDATE js_sessions SET expires_at = ? WHERE token_hash = ?")
      .run("2026-01-01T00:00:00.000Z", createHash("sha256").update(token!).digest("hex"));
  });
  await page.goto("/customer/dashboard");
  await page.waitForURL(/\/login/);
  await expect(page.getByText("Your session expired. Please sign in again.")).toBeVisible();
});

test("customers cannot open admin operations", async ({ page }) => {
  await login(page, "customer@example.com", /\/customer\/dashboard/);
  await page.goto("/admin/dashboard");
  await page.waitForURL(/\/customer\/dashboard/);
  await expect(page.getByText(/Customer workspace/i)).toBeVisible();
});

test("customers can discover a cleaner and inspect active services", async ({ page }) => {
  await page.goto("/cleaners");
  await expect(page.getByRole("heading", { name: "FreshFold Laundry" })).toBeVisible();
  await expect(page.getByText("Accepting orders")).toBeVisible();
  await page.getByRole("link", { name: "View cleaner" }).click();
  await page.waitForURL(/\/cleaners\/1/);
  await expect(page.getByRole("link", { name: "Book this cleaner" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Shirt Laundry" })).toBeVisible();
});

test("service quantities and checkout fields preserve their browser cart values", async ({ page }) => {
  await page.goto("/orders/new?cleaner=1");
  const shirt = page.locator("label").filter({ hasText: "Shirt Laundry" });
  await shirt.locator('input[type="number"]').fill("2");
  await page.getByLabel("Pickup date").fill(futureDate(2));
  await page.getByLabel("Pickup window").selectOption({ label: "8am - 10am" });
  await expect(shirt.locator('input[type="number"]')).toHaveValue("2");
  await expect(page.getByRole("button", { name: "Continue to sign in" })).toBeEnabled();
});

test("authentication redirect restores the cleaner, cart, schedule, and addresses", async ({ page }) => {
  await page.goto("/orders/new?cleaner=1");
  const shirtQuantity = page.locator("label").filter({ hasText: "Shirt Laundry" }).locator('input[type="number"]');
  await shirtQuantity.fill("3");
  await page.getByLabel("Pickup date").fill(futureDate(2));
  await page.getByLabel("Pickup window").selectOption({ label: "10am - 12pm" });
  await page.getByLabel("Manual pickup address").fill("18 Test Avenue, Lagos");
  await page.getByLabel("Manual delivery address").fill("21 Test Avenue, Lagos");
  await page.getByRole("button", { name: "Continue to sign in" }).click();
  await page.waitForURL(/\/login\?returnTo=/);

  await page.getByLabel("Email").fill("customer@example.com");
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(/\/orders\/new\?cleaner=1&resume=1/);
  await expect(shirtQuantity).toHaveValue("3");
  await expect(page.getByLabel("Pickup window")).toHaveValue("10am - 12pm");
  await expect(page.getByLabel("Manual pickup address")).toHaveValue("18 Test Avenue, Lagos");
});

test("customer submits an order with server-calculated prices", async ({ page }) => {
  await login(page, "customer@example.com", /\/customer\/dashboard/);
  await page.goto("/orders/new?cleaner=1");
  await page.locator("label").filter({ hasText: "Shirt Laundry" }).locator('input[type="number"]').fill("2");
  await page.getByLabel("Pickup date").fill(futureDate(2));
  await page.getByLabel("Pickup window").selectOption({ label: "8am - 10am" });
  await page.getByRole("button", { name: "Create order" }).click();
  await page.waitForURL(/\/orders\/\d+\?success=/);
  await expect(page.getByText("Order created successfully")).toBeVisible();

  const orderId = Number(page.url().match(/\/orders\/(\d+)/)?.[1]);
  const order = withDatabase((database) => database.prepare("SELECT subtotal, delivery_fee, platform_fee, total FROM orders WHERE id = ?").get(orderId)) as {
    subtotal: number; delivery_fee: number; platform_fee: number; total: number;
  };
  expect(order).toEqual({ subtotal: 2400, delivery_fee: 1500, platform_fee: 500, total: 4400 });
});

test("vendor processes only its order and creates activity plus an audit event", async ({ page }) => {
  const orderId = seedOrder();
  await login(page, "cleaner@example.com", /\/cleaner\/dashboard/);
  await page.goto(`/orders/${orderId}`);
  await page.getByRole("button", { name: "Mark as accepted" }).click();
  await expect(page.getByRole("button", { name: "Mark as picked up" })).toBeVisible();

  const result = withDatabase((database) => ({
    order: database.prepare("SELECT status FROM orders WHERE id = ?").get(orderId) as { status: string },
    activities: (database.prepare("SELECT COUNT(*) AS count FROM order_activities WHERE order_id = ? AND action = 'order_status_updated'").get(orderId) as { count: number }).count,
    audits: (database.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE action = 'order.status_update' AND target_id = ? AND outcome = 'succeeded'").get(String(orderId)) as { count: number }).count,
  }));
  expect(result.order.status).toBe("accepted");
  expect(result.activities).toBe(1);
  expect(result.audits).toBe(1);
});

test("customer tracks the order activity created by the vendor", async ({ page }) => {
  const orderId = seedOrder("accepted");
  await login(page, "customer@example.com", /\/customer\/dashboard/);
  await page.goto(`/orders/${orderId}`);
  await expect(page.getByRole("heading", { name: "FreshFold Laundry" })).toBeVisible();
  await expect(page.getByText("FreshFold Laundry accepted the order.")).toBeVisible();
  await expect(page.getByText("Accepted", { exact: true })).toBeVisible();
});

test("admin approval is permission-protected, audited, and does not auto-publish", async ({ page }) => {
  const ids = records();
  withDatabase((database) => {
    database.prepare(`UPDATE cleaners SET verification_status = 'pending', onboarding_step = 'submitted',
      is_approved = 0, is_published = 0, is_available = 0, approved_at = NULL WHERE id = ?`).run(ids.cleaner.id);
  });
  await login(page, "admin@example.com", /\/admin\/dashboard/);
  await page.goto(`/admin/cleaners/${ids.cleaner.id}`);
  await page.getByRole("button", { name: "Approve verification" }).click();
  await expect(page.getByText("Verification approved")).toBeVisible();

  const result = withDatabase((database) => ({
    cleaner: database.prepare("SELECT verification_status, is_approved, is_published, is_available FROM cleaners WHERE id = ?").get(ids.cleaner.id) as Record<string, string | number>,
    audits: (database.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE action = 'admin.cleaner_approval' AND target_id = ? AND outcome = 'succeeded'").get(String(ids.cleaner.id)) as { count: number }).count,
  }));
  expect(result.cleaner).toEqual({ verification_status: "approved", is_approved: 1, is_published: 0, is_available: 0 });
  expect(result.audits).toBe(1);
});

test("restricted vendor documents remain hidden from unauthenticated users", async ({ request }) => {
  const ids = records();
  const fileId = withDatabase((database) => (database.prepare("SELECT id FROM vendor_files WHERE cleaner_id = ? AND kind = 'identity_document'").get(ids.cleaner.id) as { id: number }).id);
  const response = await request.get(`/api/vendor-files/${fileId}`);
  expect(response.status()).toBe(404);
});
