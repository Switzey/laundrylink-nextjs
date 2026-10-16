import { createHash } from "node:crypto";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { expect, test, type Page } from "@playwright/test";

const databasePath = path.resolve(process.env.E2E_DATABASE_PATH ?? "data/e2e.sqlite");
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
      DELETE FROM waitlist_leads;
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

function seedComparisonCleaner() {
  return withDatabase((database) => {
    const timestamp = new Date().toISOString();
    const vendor = records().vendor;
    const passwordHash = (database.prepare("SELECT password FROM users WHERE id = ?").get(vendor.id) as { password: string }).password;
    database.prepare("DELETE FROM cleaners WHERE business_email = 'comparison@example.com'").run();
    database.prepare("DELETE FROM users WHERE email = 'comparison@example.com'").run();
    const userId = Number(database.prepare(`INSERT INTO users
      (name, email, email_verified_at, password, role, phone, phone_verified_at, phone_verified_e164, created_at, updated_at)
      VALUES ('Comparison Vendor', 'comparison@example.com', ?, ?, 'VENDOR_OWNER', '+2348030000002', ?, '+2348030000002', ?, ?)`)
      .run(timestamp, passwordHash, timestamp, timestamp, timestamp).lastInsertRowid);
    const cleanerId = Number(database.prepare(`INSERT INTO cleaners
      (user_id, business_name, description, address, city, phone, business_phone_verified_at,
       business_phone_verified_e164, rating, turnaround_time, opening_hours, is_available,
       is_approved, contact_name, business_email, state, lga, area, latitude, longitude,
       pickup_radius_km, delivery_radius_km, verification_status, onboarding_step,
       submitted_at, approved_at, is_published, is_suspended, created_at, updated_at)
      VALUES (?, 'QuickPress Laundry', 'Express garment care and reliable pickup across Victoria Island.',
       '22 Adeola Odeku Street', 'Lagos', '+2348030000002', ?, '+2348030000002', 4.4,
       '12 hours', 'Mon-Sun, 7am-8pm', 1, 1, 'Comparison Vendor', 'comparison@example.com',
       'Lagos', 'Eti-Osa', 'Victoria Island', 6.4288, 3.4213, 6, 9, 'approved', 'submitted',
       ?, ?, 1, 0, ?, ?)`)
      .run(userId, timestamp, timestamp, timestamp, timestamp, timestamp).lastInsertRowid);
    database.prepare(`INSERT INTO vendor_verifications
      (cleaner_id, identity_type, identity_number_encrypted, bank_name, bank_account_name,
       bank_account_number_encrypted, information_confirmed, created_at, updated_at)
      VALUES (?, 'nin', 'v1.comparison-identity', 'Demo Bank', 'Comparison Vendor',
       'v1.comparison-account', 1, ?, ?)`)
      .run(cleanerId, timestamp, timestamp);
    database.prepare(`INSERT INTO vendor_files
      (cleaner_id, kind, filename, media_type, size, sha256, contents, created_at, updated_at)
      SELECT ?, kind, 'comparison-' || filename, media_type, size, sha256, contents, ?, ?
      FROM vendor_files WHERE cleaner_id = ? AND kind IN ('logo', 'cover', 'identity_document')`)
      .run(cleanerId, timestamp, timestamp, records().cleaner.id);
    database.prepare(`INSERT INTO services
      (cleaner_id, name, category, description, price, unit, turnaround_time, express_available, is_active, created_at, updated_at)
      VALUES (?, 'Express Shirt Care', 'ironing', 'Same-day pressed shirts.', 900, 'per_item', '12 hours', 1, 1, ?, ?)`)
      .run(cleanerId, timestamp, timestamp);
    return { cleanerId, userId };
  });
}

function removeComparisonCleaner(cleanerId: number, userId: number) {
  withDatabase((database) => {
    database.prepare("DELETE FROM cleaners WHERE id = ?").run(cleanerId);
    database.prepare("DELETE FROM users WHERE id = ?").run(userId);
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
  test.slow();
  const email = `qa-registration-${Date.now()}@example.com`;
  await page.goto("/register");
  await page.getByLabel("Full name").fill("QA Registration Customer");
  await page.getByLabel("Email").fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('input[name="confirm_password"]').fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/login\?success=/, { timeout: 60_000 });
  await expect(page.getByText("Account created. You can sign in now.")).toBeVisible();

  await page.getByLabel("Email").fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/customer\/dashboard/, { timeout: 60_000 });

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

test("customer completes the multi-step booking with server-validated pricing and schedule", async ({ page }) => {
  const ids = records();
  await login(page, "customer@example.com", /\/customer\/dashboard/);
  await page.goto(`/orders/new?cleaner=${ids.cleaner.id}`);

  await page.getByRole("button", { name: "Increase Shirt Laundry quantity" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Pickup and delivery address" })).toBeVisible();

  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Pickup and return schedule" })).toBeVisible();
  await page.locator('input[name="pickup_date"]').fill(futureDate(3));
  const pickupWindow = page.locator('select[name="pickup_time_window"]');
  await expect(pickupWindow).toBeEnabled();
  await pickupWindow.selectOption({ index: 1 });
  await page.locator('select[name="delivery_time_window"]').selectOption({ index: 1 });

  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Payment" })).toBeVisible();
  await page.getByLabel(/Any increase requires my explicit approval/i).check();
  await page.getByRole("button", { name: "Confirm booking" }).click();
  await expect(page).toHaveURL(/\/orders\/\d+\?success=/, { timeout: 60_000 });
  await expect(page.getByText(/^LL-\d{8}-[A-F0-9]{8}$/)).toBeVisible();

  const booking = withDatabase((database) => database.prepare(`SELECT o.order_number, o.confirmed_at, o.payment_method,
    (SELECT COUNT(1) FROM payments p WHERE p.order_id = o.id AND p.provider = 'pay_on_pickup') AS payment_count
    FROM orders o ORDER BY o.id DESC LIMIT 1`).get()) as { order_number: string; confirmed_at: string; payment_method: string; payment_count: number };
  expect(booking.order_number).toMatch(/^LL-\d{8}-[A-F0-9]{8}$/);
  expect(booking.confirmed_at).toBeTruthy();
  expect(booking.payment_method).toBe("pay_on_pickup");
  expect(Number(booking.payment_count)).toBe(1);
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

test("guests can filter vendors, switch to the map, and compare businesses", async ({ page }) => {
  const comparison = seedComparisonCleaner();
  try {
    await page.goto("/cleaners?state=Lagos&express=1&sort=price");
    await expect(page.getByRole("heading", { name: "QuickPress Laundry" })).toBeVisible();
    await expect(page.getByText("2 cleaners found")).toBeVisible();
    await page.getByRole("link", { name: "Map view" }).click();
    await expect(page).toHaveURL(/view=map/);
    await expect(page.locator(".marketplace-map")).toBeVisible();

    const compare = page.getByLabel("Compare");
    await compare.nth(0).check();
    await compare.nth(1).check();
    await page.getByRole("link", { name: "Compare cleaners" }).click();
    await expect(page.getByRole("heading", { name: "Compare cleaners" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "FreshFold Laundry" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "QuickPress Laundry" })).toBeVisible();
  } finally {
    removeComparisonCleaner(comparison.cleanerId, comparison.userId);
  }
});

test("early access safely records a customer lead", async ({ page }) => {
  const email = `marketplace-${Date.now()}@example.com`;
  await page.goto("/waitlist");
  await page.getByLabel("Full name").fill("Marketplace Test Customer");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("State").fill("Lagos");
  await page.getByLabel("City or area").fill("Yaba");
  await page.getByRole("button", { name: "Join the waitlist" }).click();
  await expect(page).toHaveURL(/\/waitlist\?success=/);
  await expect(page.getByText(/You're on the list/i)).toBeVisible();
  const lead = withDatabase((database) => database.prepare("SELECT audience, city FROM waitlist_leads WHERE email = ?").get(email)) as { audience: string; city: string };
  expect(lead).toEqual({ audience: "customer", city: "Yaba" });
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
  test.slow();
  const ids = records();
  withDatabase((database) => {
    database.prepare(`UPDATE cleaners SET verification_status = 'pending', onboarding_step = 'submitted',
      is_approved = 0, is_published = 0, is_available = 0, approved_at = NULL WHERE id = ?`).run(ids.cleaner.id);
  });
  await login(page, "admin@example.com", /\/admin\/dashboard/);
  await page.goto(`/admin/cleaners/${ids.cleaner.id}`);
  await page.getByRole("button", { name: "Approve verification" }).click();
  await expect(page.getByText("Verification approved")).toBeVisible({ timeout: 60_000 });

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
