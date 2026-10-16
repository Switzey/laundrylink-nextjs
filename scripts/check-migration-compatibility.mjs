import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createClient } from "@libsql/client";
import { applyAuthSchemaToSqlite } from "./auth-schema.mjs";
import { applyOnboardingSchemaToSqlite } from "./onboarding-schema.mjs";
import { applySecuritySchemaToSqlite } from "./security-schema.mjs";
import { applyMarketplaceSchemaToSqlite } from "./marketplace-schema.mjs";
import { applyCustomerAccountSchemaToSqlite } from "./customer-account-schema.mjs";
import { applyPricingSchemaToSqlite } from "./pricing-schema.mjs";
import { applyBookingSchemaToSqlite } from "./booking-schema.mjs";
import { applyVendorOperationsSchemaToSqlite } from "./vendor-operations-schema.mjs";

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url || (url.startsWith("libsql:") && !authToken)) {
  throw new Error("TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are required.");
}

const client = createClient({ url, authToken });
const databasePath = path.join(os.tmpdir(), `laundrylink-schema-${randomUUID()}.sqlite`);
const database = new DatabaseSync(databasePath);

function requiredColumn(table, column) {
  const columns = database.prepare(`PRAGMA table_info("${table}")`).all();
  if (!columns.some((item) => String(item.name) === column)) {
    throw new Error(`Migration compatibility check is missing ${table}.${column}.`);
  }
}

function requiredObject(type, name) {
  const object = database.prepare("SELECT 1 FROM sqlite_master WHERE type = ? AND name = ?").get(type, name);
  if (!object) throw new Error(`Migration compatibility check is missing ${type} ${name}.`);
}

function applyMigrations() {
  applyAuthSchemaToSqlite(database);
  applyOnboardingSchemaToSqlite(database);
  applySecuritySchemaToSqlite(database);
  applyMarketplaceSchemaToSqlite(database);
  applyCustomerAccountSchemaToSqlite(database);
  applyPricingSchemaToSqlite(database);
  applyBookingSchemaToSqlite(database);
  applyVendorOperationsSchemaToSqlite(database);
}

try {
  const sourceSchema = await client.execute(`
    SELECT name, sql
    FROM sqlite_master
    WHERE type = 'table' AND sql IS NOT NULL AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `);

  if (!sourceSchema.rows.length) throw new Error("The hosted database schema is empty.");

  database.exec("PRAGMA foreign_keys = OFF");
  for (const object of sourceSchema.rows) database.exec(String(object.sql));
  database.exec("PRAGMA foreign_keys = ON");

  applyMigrations();
  applyMigrations();

  requiredObject("table", "phone_verification_attempts");
  requiredObject("table", "vendor_verifications");
  requiredObject("table", "vendor_files");
  requiredObject("table", "favorite_cleaners");
  requiredObject("table", "customer_preferences");
  requiredObject("table", "support_tickets");
  requiredColumn("addresses", "latitude");
  requiredColumn("addresses", "longitude");
  requiredColumn("addresses", "landmark");
  requiredObject("table", "waitlist_leads");
  requiredObject("view", "vendor_eligibility");
  requiredColumn("users", "phone_verified_e164");
  requiredColumn("cleaners", "business_phone_verified_at");
  requiredColumn("cleaners", "business_phone_verified_e164");
  requiredColumn("cleaners", "is_published");
  requiredColumn("cleaners", "is_suspended");
  requiredColumn("orders", "order_number");
  requiredColumn("orders", "voucher_discount_amount");
  requiredColumn("cleaners", "daily_order_capacity");
  requiredObject("table", "vouchers");
  requiredObject("table", "voucher_redemptions");
  requiredObject("table", "order_attachments");
  requiredObject("table", "order_price_adjustments");
  requiredColumn("cleaners", "minimum_order_amount");
  requiredColumn("services", "price_version");
  requiredColumn("order_items", "service_name");
  requiredColumn("order_items", "pricing_snapshot");
  requiredColumn("orders", "pricing_status");
  requiredColumn("orders", "pending_pricing_snapshot");
  requiredObject("table", "service_bulk_discounts");
  requiredObject("table", "delivery_zones");
  requiredObject("table", "service_price_history");
  requiredColumn("cleaners", "daily_weight_capacity");
  requiredColumn("cleaners", "auto_accept_orders");
  requiredColumn("orders", "production_stage");
  requiredObject("table", "vendor_branches");
  requiredObject("table", "branch_services");
  requiredObject("table", "vendor_staff_profiles");
  requiredObject("table", "staff_shifts");
  requiredObject("table", "vendor_closures");
  requiredObject("table", "order_stage_events");
  requiredObject("table", "garment_records");
  requiredObject("table", "equipment_maintenance");
  requiredObject("table", "order_resolution_requests");
  requiredObject("table", "review_responses");

  const foreignKeyFailures = database.prepare("PRAGMA foreign_key_check").all();
  if (foreignKeyFailures.length) throw new Error("The migrated schema failed its foreign-key check.");

  console.log(JSON.stringify({
    sourceTables: sourceSchema.rows.length,
    migrationPasses: 2,
    foreignKeyFailures: 0,
    compatible: true,
  }));
} finally {
  database.close();
  client.close();
  for (const suffix of ["", "-shm", "-wal"]) rmSync(`${databasePath}${suffix}`, { force: true });
}
