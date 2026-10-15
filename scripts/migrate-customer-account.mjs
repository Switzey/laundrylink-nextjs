import { createClient } from "@libsql/client";
import { applyCustomerAccountSchemaToLibsql } from "./customer-account-schema.mjs";

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url || (url.startsWith("libsql:") && !authToken)) {
  throw new Error("TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are required.");
}

const client = createClient({ url, authToken });
try {
  await client.execute("PRAGMA foreign_keys = ON");
  await applyCustomerAccountSchemaToLibsql(client);
  console.log("Customer account schema migration complete.");
} finally {
  client.close();
}
