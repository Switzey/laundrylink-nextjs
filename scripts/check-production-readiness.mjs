import { createClient } from "@libsql/client";

const failures = [];
const warnings = [];
const passes = [];

function value(name) {
  return process.env[name]?.trim() || "";
}

function pass(message) {
  passes.push(message);
}

function fail(message) {
  failures.push(message);
}

function warn(message) {
  warnings.push(message);
}

function configuredGroup(label, names) {
  const configured = names.filter((name) => Boolean(value(name)));
  if (configured.length === names.length) {
    pass(`${label} is configured.`);
    return;
  }
  if (configured.length === 0) {
    warn(`${label} is unavailable because its environment variables are not configured.`);
    return;
  }
  fail(`${label} is partially configured. Set all of: ${names.join(", ")}.`);
}

function validBase64Key(candidate) {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(candidate) || candidate.length % 4 !== 0) return false;
  const decoded = Buffer.from(candidate, "base64");
  return decoded.length === 32 && decoded.toString("base64") === candidate;
}

const environment = value("APP_ENV");
if (environment === "production" || environment === "staging") pass(`APP_ENV is ${environment}.`);
else fail("APP_ENV must be production or staging for a hosted readiness check.");

const origin = value("APP_ORIGIN");
try {
  const parsed = new URL(origin);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.pathname !== "/") {
    fail("APP_ORIGIN must be a credential-free HTTPS origin with no path.");
  } else {
    pass(`APP_ORIGIN is a valid HTTPS origin (${parsed.hostname}).`);
  }
} catch {
  fail("APP_ORIGIN must be a valid absolute HTTPS URL.");
}

const auditSalt = value("AUDIT_LOG_SALT");
if (auditSalt.length >= 32) pass("AUDIT_LOG_SALT has an acceptable length.");
else fail("AUDIT_LOG_SALT must contain at least 32 unpredictable characters.");

if (validBase64Key(value("PAYOUT_ENCRYPTION_KEY"))) {
  pass("PAYOUT_ENCRYPTION_KEY is a canonical base64-encoded 32-byte key.");
} else {
  fail("PAYOUT_ENCRYPTION_KEY must be a canonical base64-encoded 32-byte key.");
}

configuredGroup("Authentication email", ["RESEND_API_KEY", "AUTH_EMAIL_FROM"]);
configuredGroup("Google sign-in", ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"]);
configuredGroup("Apple sign-in", ["APPLE_CLIENT_ID", "APPLE_CLIENT_SECRET"]);
configuredGroup("Twilio phone verification", [
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_VERIFY_SERVICE_SID",
]);

const databaseUrl = value("TURSO_DATABASE_URL");
const databaseToken = value("TURSO_AUTH_TOKEN");
if (!databaseUrl) fail("TURSO_DATABASE_URL is required.");
if (!databaseToken) fail("TURSO_AUTH_TOKEN is required.");

if (databaseUrl && databaseToken) {
  const client = createClient({ url: databaseUrl, authToken: databaseToken });
  try {
    const ping = await client.execute("SELECT 1 AS healthy");
    if (Number(ping.rows[0]?.healthy) !== 1) throw new Error("Unexpected readiness result.");
    pass("The hosted database is reachable.");

    const schema = await client.execute(
      "SELECT type, name FROM sqlite_master WHERE type IN ('table', 'trigger', 'view')",
    );
    const tables = new Set(
      schema.rows.filter((row) => row.type === "table").map((row) => String(row.name)),
    );
    const triggers = new Set(
      schema.rows.filter((row) => row.type === "trigger").map((row) => String(row.name)),
    );
    const views = new Set(
      schema.rows.filter((row) => row.type === "view").map((row) => String(row.name)),
    );
    const requiredTables = [
      "users",
      "cleaners",
      "services",
      "orders",
      "js_sessions",
      "oauth_accounts",
      "auth_tokens",
      "vendor_memberships",
      "vendor_verifications",
      "vendor_files",
      "audit_logs",
      "rate_limits",
      "phone_verification_attempts",
    ];
    const missingTables = requiredTables.filter((table) => !tables.has(table));
    if (missingTables.length) fail(`Database migrations are incomplete. Missing tables: ${missingTables.join(", ")}.`);
    else pass("Required database tables are present.");

    const requiredTriggers = [
      "validate_users_insert",
      "validate_users_update",
      "validate_cleaners_insert",
      "validate_cleaners_update",
      "validate_sessions_insert",
    ];
    const missingTriggers = requiredTriggers.filter((trigger) => !triggers.has(trigger));
    if (missingTriggers.length) fail(`Security schema is incomplete. Missing triggers: ${missingTriggers.join(", ")}.`);
    else pass("Critical database security triggers are present.");
    if (!views.has("vendor_eligibility")) fail("Marketplace eligibility schema is incomplete. Missing view: vendor_eligibility.");
    else pass("Central marketplace eligibility view is present.");

    const userColumns = await client.execute("PRAGMA table_info(users)");
    const cleanerColumns = await client.execute("PRAGMA table_info(cleaners)");
    const userColumnNames = new Set(userColumns.rows.map((row) => String(row.name)));
    const cleanerColumnNames = new Set(cleanerColumns.rows.map((row) => String(row.name)));
    const missingColumns = [
      ...["email_verified_at", "phone_verified_at", "phone_verified_e164"]
        .filter((column) => !userColumnNames.has(column)).map((column) => `users.${column}`),
      ...["verification_status", "business_phone_verified_at", "business_phone_verified_e164", "is_published", "is_suspended"]
        .filter((column) => !cleanerColumnNames.has(column)).map((column) => `cleaners.${column}`),
    ];
    if (missingColumns.length) fail(`Database migrations are incomplete. Missing columns: ${missingColumns.join(", ")}.`);
    else pass("Required authentication and vendor columns are present.");
  } catch (error) {
    fail(`Hosted database readiness failed (${error instanceof Error ? error.name : "unknown error"}).`);
  } finally {
    client.close();
  }
}

for (const message of passes) console.log(`PASS  ${message}`);
for (const message of warnings) console.warn(`WARN  ${message}`);
for (const message of failures) console.error(`FAIL  ${message}`);
console.log(`\nReadiness summary: ${passes.length} passed, ${warnings.length} warnings, ${failures.length} failures.`);

if (failures.length) process.exitCode = 1;
