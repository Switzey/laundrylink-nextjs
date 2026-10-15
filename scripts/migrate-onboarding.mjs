import { createClient } from "@libsql/client";
import { applyAuthSchemaToLibsql } from "./auth-schema.mjs";
import { applyOnboardingSchemaToLibsql } from "./onboarding-schema.mjs";
import { applySecuritySchemaToLibsql } from "./security-schema.mjs";

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url || (url.startsWith("libsql:") && !authToken)) {
  throw new Error("TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are required.");
}

const client = createClient({ url, authToken });
try {
  await applyAuthSchemaToLibsql(client);
  await applyOnboardingSchemaToLibsql(client);
  await applySecuritySchemaToLibsql(client);
  console.log("Authentication, vendor onboarding, and security schema migration complete.");
} finally {
  client.close();
}
