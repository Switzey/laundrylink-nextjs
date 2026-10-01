import path from "node:path";
import { pathToFileURL } from "node:url";
import { createClient } from "@libsql/client";
import { applyAuthSchemaToLibsql } from "./auth-schema.mjs";
import { applySecuritySchemaToLibsql } from "./security-schema.mjs";

const url = process.env.TURSO_DATABASE_URL ||
  pathToFileURL(process.env.DATABASE_PATH || path.join(process.cwd(), "data", "laundrylink.sqlite")).href;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (url.startsWith("libsql:") && !authToken) {
  throw new Error("TURSO_AUTH_TOKEN is required for a hosted libSQL database.");
}

const client = createClient({ url, authToken });
try {
  await applyAuthSchemaToLibsql(client);
  await applySecuritySchemaToLibsql(client);
  const result = await client.execute(
    "SELECT name FROM sqlite_master WHERE type IN ('table', 'trigger', 'index') AND (name LIKE 'audit_%' OR name LIKE 'rate_%' OR name LIKE 'validate_%')",
  );
  console.log(`Authentication and security schema ready (${result.rows.length} protected objects).`);
} finally {
  client.close();
}
