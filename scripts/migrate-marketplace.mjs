import path from "node:path";
import { pathToFileURL } from "node:url";
import { createClient } from "@libsql/client";
import { applyMarketplaceSchemaToLibsql } from "./marketplace-schema.mjs";

const url = process.env.TURSO_DATABASE_URL ||
  pathToFileURL(process.env.DATABASE_PATH || path.join(process.cwd(), "data", "laundrylink.sqlite")).href;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (url.startsWith("libsql:") && !authToken) {
  throw new Error("TURSO_AUTH_TOKEN is required for a hosted libSQL database.");
}

const client = createClient({ url, authToken });
try {
  await applyMarketplaceSchemaToLibsql(client);
  console.log("Marketplace search indexes and waitlist schema are ready.");
} finally {
  client.close();
}
