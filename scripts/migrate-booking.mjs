import { createClient } from "@libsql/client";
import { applyBookingSchemaToLibsql } from "./booking-schema.mjs";

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url || (url.startsWith("libsql:") && !authToken)) {
  throw new Error("TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are required.");
}

const client = createClient({ url, authToken });
try {
  await client.execute("PRAGMA foreign_keys = ON");
  await applyBookingSchemaToLibsql(client);
  console.log("Booking schema migration complete.");
} finally {
  client.close();
}
