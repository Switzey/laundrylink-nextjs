import path from "node:path";
import { pathToFileURL } from "node:url";
import { createClient } from "@libsql/client";
import { parsePhoneNumberFromString } from "libphonenumber-js";

const url = process.env.TURSO_DATABASE_URL ||
  pathToFileURL(process.env.DATABASE_PATH || path.join(process.cwd(), "data", "laundrylink.sqlite")).href;
const client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
const normalize = (value) => {
  const phone = value ? parsePhoneNumberFromString(String(value), "NG") : null;
  return phone?.isValid() ? phone.number : null;
};

async function hasColumn(table, column) {
  const result = await client.execute(`PRAGMA table_info("${table}")`);
  return result.rows.some((row) => String(row.name) === column);
}

try {
  const userBindingExists = await hasColumn("users", "phone_verified_e164");
  const businessBindingExists = await hasColumn("cleaners", "business_phone_verified_e164");
  const users = await client.execute(
    `SELECT id, role, phone, phone_verified_at${userBindingExists ? ", phone_verified_e164" : ""}
     FROM users`,
  );
  const cleaners = await client.execute(
    `SELECT c.id, c.phone, c.is_approved, c.is_available,
            ${businessBindingExists ? "c.business_phone_verified_at, c.business_phone_verified_e164," : ""}
            u.phone AS account_phone, u.phone_verified_at AS account_phone_verified_at
            ${userBindingExists ? ", u.phone_verified_e164 AS account_phone_verified_e164" : ""}
     FROM cleaners c LEFT JOIN users u ON u.id = c.user_id`,
  );

  const account = {
    total: users.rows.length,
    verificationRequired: 0,
    verifiedTimestamps: 0,
    exactBindings: 0,
    potentiallyStale: 0,
    invalidNumbers: 0,
  };
  for (const row of users.rows) {
    if (["VENDOR_OWNER", "VENDOR_MANAGER", "VENDOR_STAFF", "RIDER", "cleaner"].includes(String(row.role))) account.verificationRequired++;
    const normalized = normalize(row.phone);
    if (row.phone && !normalized) account.invalidNumbers++;
    if (row.phone_verified_at) account.verifiedTimestamps++;
    const binding = userBindingExists ? String(row.phone_verified_e164 ?? "") : "";
    if (row.phone_verified_at && normalized && binding === normalized) account.exactBindings++;
    else if (row.phone_verified_at) account.potentiallyStale++;
  }

  const business = {
    total: cleaners.rows.length,
    approved: 0,
    available: 0,
    exactBindings: 0,
    potentiallyStale: 0,
    differsFromAccount: 0,
    invalidNumbers: 0,
  };
  for (const row of cleaners.rows) {
    if (Number(row.is_approved)) business.approved++;
    if (Number(row.is_available)) business.available++;
    const normalized = normalize(row.phone);
    const accountPhone = normalize(row.account_phone);
    if (row.phone && !normalized) business.invalidNumbers++;
    if (normalized && accountPhone && normalized !== accountPhone) business.differsFromAccount++;
    const binding = businessBindingExists ? String(row.business_phone_verified_e164 ?? "") : "";
    if (businessBindingExists && row.business_phone_verified_at && normalized && binding === normalized) business.exactBindings++;
    else if (Number(row.is_approved) || Number(row.is_available)) business.potentiallyStale++;
  }

  console.log(JSON.stringify({ account, business }, null, 2));
} finally {
  client.close();
}
