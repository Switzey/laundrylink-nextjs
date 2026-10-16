import { createClient } from "@libsql/client";
import { applyPricingSchemaToLibsql } from "./pricing-schema.mjs";

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;
if (!url || !authToken) throw new Error("TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are required.");

const client = createClient({ url, authToken });
await applyPricingSchemaToLibsql(client);
console.log("Pricing schema migration complete.");
client.close();
