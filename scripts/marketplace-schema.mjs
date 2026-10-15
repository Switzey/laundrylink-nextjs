export const marketplaceSchemaStatements = [
  `CREATE TABLE IF NOT EXISTS waitlist_leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    audience TEXT NOT NULL,
    state TEXT NOT NULL,
    city TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'public_waitlist',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  "CREATE UNIQUE INDEX IF NOT EXISTS waitlist_leads_unique ON waitlist_leads(lower(email), lower(city), audience)",
  "CREATE INDEX IF NOT EXISTS waitlist_leads_location_index ON waitlist_leads(state, city, audience)",
  "CREATE INDEX IF NOT EXISTS cleaners_public_location_index ON cleaners(state, city, lga, area)",
  "CREATE INDEX IF NOT EXISTS services_marketplace_filter_index ON services(is_active, category, price, express_available)",
  `CREATE TRIGGER IF NOT EXISTS validate_waitlist_leads_insert BEFORE INSERT ON waitlist_leads BEGIN
    SELECT CASE WHEN length(trim(NEW.name)) NOT BETWEEN 2 AND 100 THEN RAISE(ABORT, 'invalid waitlist name') END;
    SELECT CASE WHEN length(trim(NEW.email)) NOT BETWEEN 3 AND 254 OR NEW.email <> lower(trim(NEW.email)) OR NEW.email NOT LIKE '%_@_%._%' THEN RAISE(ABORT, 'invalid waitlist email') END;
    SELECT CASE WHEN NEW.phone IS NOT NULL AND length(trim(NEW.phone)) NOT BETWEEN 7 AND 30 THEN RAISE(ABORT, 'invalid waitlist phone') END;
    SELECT CASE WHEN NEW.audience NOT IN ('customer', 'vendor') THEN RAISE(ABORT, 'invalid waitlist audience') END;
    SELECT CASE WHEN length(trim(NEW.state)) NOT BETWEEN 2 AND 80 OR length(trim(NEW.city)) NOT BETWEEN 2 AND 100 THEN RAISE(ABORT, 'invalid waitlist location') END;
    SELECT CASE WHEN length(trim(NEW.source)) NOT BETWEEN 2 AND 80 THEN RAISE(ABORT, 'invalid waitlist source') END;
  END`,
  `CREATE TRIGGER IF NOT EXISTS validate_waitlist_leads_update BEFORE UPDATE ON waitlist_leads BEGIN
    SELECT CASE WHEN length(trim(NEW.name)) NOT BETWEEN 2 AND 100 THEN RAISE(ABORT, 'invalid waitlist name') END;
    SELECT CASE WHEN length(trim(NEW.email)) NOT BETWEEN 3 AND 254 OR NEW.email <> lower(trim(NEW.email)) OR NEW.email NOT LIKE '%_@_%._%' THEN RAISE(ABORT, 'invalid waitlist email') END;
    SELECT CASE WHEN NEW.phone IS NOT NULL AND length(trim(NEW.phone)) NOT BETWEEN 7 AND 30 THEN RAISE(ABORT, 'invalid waitlist phone') END;
    SELECT CASE WHEN NEW.audience NOT IN ('customer', 'vendor') THEN RAISE(ABORT, 'invalid waitlist audience') END;
    SELECT CASE WHEN length(trim(NEW.state)) NOT BETWEEN 2 AND 80 OR length(trim(NEW.city)) NOT BETWEEN 2 AND 100 THEN RAISE(ABORT, 'invalid waitlist location') END;
    SELECT CASE WHEN length(trim(NEW.source)) NOT BETWEEN 2 AND 80 THEN RAISE(ABORT, 'invalid waitlist source') END;
  END`,
];

const marketplaceTriggerNames = ["validate_waitlist_leads_insert", "validate_waitlist_leads_update"];

export function applyMarketplaceSchemaToSqlite(database) {
  for (const trigger of marketplaceTriggerNames) database.exec(`DROP TRIGGER IF EXISTS ${trigger}`);
  for (const statement of marketplaceSchemaStatements) database.exec(statement);
}

export async function applyMarketplaceSchemaToLibsql(client) {
  for (const trigger of marketplaceTriggerNames) await client.execute(`DROP TRIGGER IF EXISTS ${trigger}`);
  for (const statement of marketplaceSchemaStatements) await client.execute(statement);
}
