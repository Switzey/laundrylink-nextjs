import path from "node:path";
import { pathToFileURL } from "node:url";
import { createClient } from "@libsql/client";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import { applyAuthSchemaToLibsql } from "./auth-schema.mjs";
import { applyOnboardingSchemaToLibsql } from "./onboarding-schema.mjs";
import { applySecuritySchemaToLibsql } from "./security-schema.mjs";

const url = process.env.TURSO_DATABASE_URL ||
  pathToFileURL(process.env.DATABASE_PATH || path.join(process.cwd(), "data", "laundrylink.sqlite")).href;
const authToken = process.env.TURSO_AUTH_TOKEN;
if (url.startsWith("libsql:") && !authToken) throw new Error("TURSO_AUTH_TOKEN is required.");

const client = createClient({ url, authToken });
const normalize = (value) => {
  const phone = value ? parsePhoneNumberFromString(String(value), "NG") : null;
  return phone?.isValid() ? phone.number : null;
};

try {
  await applyAuthSchemaToLibsql(client);
  await applyOnboardingSchemaToLibsql(client);

  let normalizedAccounts = 0;
  let normalizedBusinesses = 0;
  const users = await client.execute("SELECT id, phone FROM users WHERE phone IS NOT NULL");
  for (const row of users.rows) {
    const normalized = normalize(row.phone);
    if (normalized && normalized !== row.phone) {
      await client.execute({ sql: "UPDATE users SET phone = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", args: [normalized, row.id] });
      normalizedAccounts++;
    }
  }
  const cleaners = await client.execute("SELECT id, phone FROM cleaners WHERE phone IS NOT NULL");
  for (const row of cleaners.rows) {
    const normalized = normalize(row.phone);
    if (normalized && normalized !== row.phone) {
      await client.execute({ sql: "UPDATE cleaners SET phone = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", args: [normalized, row.id] });
      normalizedBusinesses++;
    }
  }

  // Legacy timestamps are deliberately not trusted because they were not bound to a specific value.
  await client.execute("UPDATE users SET phone_verified_at = NULL, phone_verified_e164 = NULL WHERE phone_verified_e164 IS NULL OR phone <> phone_verified_e164");
  await client.execute("UPDATE cleaners SET business_phone_verified_at = NULL, business_phone_verified_e164 = NULL, is_available = 0 WHERE business_phone_verified_e164 IS NULL OR phone <> business_phone_verified_e164");
  await client.execute("UPDATE phone_verification_attempts SET status = 'invalidated', updated_at = CURRENT_TIMESTAMP WHERE status IN ('pending', 'checking')");
  await applySecuritySchemaToLibsql(client);
  console.log(JSON.stringify({ normalizedAccounts, normalizedBusinesses, legacyVerificationTrusted: false }));
} finally {
  client.close();
}
