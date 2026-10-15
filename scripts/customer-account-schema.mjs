const addressColumns = [
  ["landmark", "TEXT"],
  ["latitude", "REAL"],
  ["longitude", "REAL"],
];

export const customerAccountSchemaStatements = [
  `CREATE TABLE IF NOT EXISTS favorite_cleaners (
    user_id INTEGER NOT NULL,
    cleaner_id INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (user_id, cleaner_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (cleaner_id) REFERENCES cleaners(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS customer_preferences (
    user_id INTEGER PRIMARY KEY,
    fragrance_preference TEXT,
    detergent_sensitivity TEXT,
    ironing_instructions TEXT,
    folding_style TEXT,
    special_garment_care TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS support_tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    order_id INTEGER,
    category TEXT NOT NULL,
    subject TEXT NOT NULL,
    message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    priority TEXT NOT NULL DEFAULT 'normal',
    resolution TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL
  )`,
  "CREATE INDEX IF NOT EXISTS favorite_cleaners_cleaner_index ON favorite_cleaners(cleaner_id)",
  "CREATE INDEX IF NOT EXISTS support_tickets_user_status_index ON support_tickets(user_id, status, created_at)",
  `CREATE TRIGGER IF NOT EXISTS validate_customer_address_coordinates_insert BEFORE INSERT ON addresses BEGIN
    SELECT CASE WHEN NEW.landmark IS NOT NULL AND length(NEW.landmark) > 250 THEN RAISE(ABORT, 'landmark too long') END;
    SELECT CASE WHEN (NEW.latitude IS NULL) <> (NEW.longitude IS NULL) THEN RAISE(ABORT, 'incomplete address coordinates') END;
    SELECT CASE WHEN NEW.latitude IS NOT NULL AND (NEW.latitude < -90 OR NEW.latitude > 90 OR NEW.longitude < -180 OR NEW.longitude > 180) THEN RAISE(ABORT, 'invalid address coordinates') END;
  END`,
  `CREATE TRIGGER IF NOT EXISTS validate_customer_address_coordinates_update BEFORE UPDATE ON addresses BEGIN
    SELECT CASE WHEN NEW.landmark IS NOT NULL AND length(NEW.landmark) > 250 THEN RAISE(ABORT, 'landmark too long') END;
    SELECT CASE WHEN (NEW.latitude IS NULL) <> (NEW.longitude IS NULL) THEN RAISE(ABORT, 'incomplete address coordinates') END;
    SELECT CASE WHEN NEW.latitude IS NOT NULL AND (NEW.latitude < -90 OR NEW.latitude > 90 OR NEW.longitude < -180 OR NEW.longitude > 180) THEN RAISE(ABORT, 'invalid address coordinates') END;
  END`,
  `CREATE TRIGGER IF NOT EXISTS validate_customer_preferences_insert BEFORE INSERT ON customer_preferences BEGIN
    SELECT CASE WHEN NEW.fragrance_preference IS NOT NULL AND length(NEW.fragrance_preference) > 120 THEN RAISE(ABORT, 'fragrance preference too long') END;
    SELECT CASE WHEN NEW.detergent_sensitivity IS NOT NULL AND length(NEW.detergent_sensitivity) > 500 THEN RAISE(ABORT, 'detergent sensitivity too long') END;
    SELECT CASE WHEN NEW.ironing_instructions IS NOT NULL AND length(NEW.ironing_instructions) > 500 THEN RAISE(ABORT, 'ironing instructions too long') END;
    SELECT CASE WHEN NEW.folding_style IS NOT NULL AND length(NEW.folding_style) > 120 THEN RAISE(ABORT, 'folding style too long') END;
    SELECT CASE WHEN NEW.special_garment_care IS NOT NULL AND length(NEW.special_garment_care) > 1000 THEN RAISE(ABORT, 'special garment care too long') END;
  END`,
  `CREATE TRIGGER IF NOT EXISTS validate_customer_preferences_update BEFORE UPDATE ON customer_preferences BEGIN
    SELECT CASE WHEN NEW.fragrance_preference IS NOT NULL AND length(NEW.fragrance_preference) > 120 THEN RAISE(ABORT, 'fragrance preference too long') END;
    SELECT CASE WHEN NEW.detergent_sensitivity IS NOT NULL AND length(NEW.detergent_sensitivity) > 500 THEN RAISE(ABORT, 'detergent sensitivity too long') END;
    SELECT CASE WHEN NEW.ironing_instructions IS NOT NULL AND length(NEW.ironing_instructions) > 500 THEN RAISE(ABORT, 'ironing instructions too long') END;
    SELECT CASE WHEN NEW.folding_style IS NOT NULL AND length(NEW.folding_style) > 120 THEN RAISE(ABORT, 'folding style too long') END;
    SELECT CASE WHEN NEW.special_garment_care IS NOT NULL AND length(NEW.special_garment_care) > 1000 THEN RAISE(ABORT, 'special garment care too long') END;
  END`,
  `CREATE TRIGGER IF NOT EXISTS validate_support_tickets_insert BEFORE INSERT ON support_tickets BEGIN
    SELECT CASE WHEN NEW.category NOT IN ('order', 'payment', 'pickup_delivery', 'quality', 'account', 'other') THEN RAISE(ABORT, 'invalid support category') END;
    SELECT CASE WHEN length(trim(NEW.subject)) NOT BETWEEN 3 AND 120 THEN RAISE(ABORT, 'invalid support subject') END;
    SELECT CASE WHEN length(trim(NEW.message)) NOT BETWEEN 10 AND 2000 THEN RAISE(ABORT, 'invalid support message') END;
    SELECT CASE WHEN NEW.status NOT IN ('open', 'in_progress', 'waiting_for_customer', 'resolved', 'closed') THEN RAISE(ABORT, 'invalid support status') END;
    SELECT CASE WHEN NEW.priority NOT IN ('low', 'normal', 'high', 'urgent') THEN RAISE(ABORT, 'invalid support priority') END;
    SELECT CASE WHEN NEW.resolution IS NOT NULL AND length(NEW.resolution) > 2000 THEN RAISE(ABORT, 'support resolution too long') END;
  END`,
  `CREATE TRIGGER IF NOT EXISTS validate_support_tickets_update BEFORE UPDATE ON support_tickets BEGIN
    SELECT CASE WHEN NEW.category NOT IN ('order', 'payment', 'pickup_delivery', 'quality', 'account', 'other') THEN RAISE(ABORT, 'invalid support category') END;
    SELECT CASE WHEN length(trim(NEW.subject)) NOT BETWEEN 3 AND 120 THEN RAISE(ABORT, 'invalid support subject') END;
    SELECT CASE WHEN length(trim(NEW.message)) NOT BETWEEN 10 AND 2000 THEN RAISE(ABORT, 'invalid support message') END;
    SELECT CASE WHEN NEW.status NOT IN ('open', 'in_progress', 'waiting_for_customer', 'resolved', 'closed') THEN RAISE(ABORT, 'invalid support status') END;
    SELECT CASE WHEN NEW.priority NOT IN ('low', 'normal', 'high', 'urgent') THEN RAISE(ABORT, 'invalid support priority') END;
    SELECT CASE WHEN NEW.resolution IS NOT NULL AND length(NEW.resolution) > 2000 THEN RAISE(ABORT, 'support resolution too long') END;
  END`,
];

const triggerNames = [
  "validate_customer_address_coordinates_insert",
  "validate_customer_address_coordinates_update",
  "validate_customer_preferences_insert",
  "validate_customer_preferences_update",
  "validate_support_tickets_insert",
  "validate_support_tickets_update",
];

function sqliteColumns(database, table) {
  return new Set(database.prepare(`PRAGMA table_info("${table}")`).all().map((column) => String(column.name)));
}

async function libsqlColumns(client, table) {
  const result = await client.execute(`PRAGMA table_info("${table}")`);
  return new Set(result.rows.map((column) => String(column.name)));
}

export function applyCustomerAccountSchemaToSqlite(database) {
  const columns = sqliteColumns(database, "addresses");
  for (const [name, definition] of addressColumns) {
    if (!columns.has(name)) database.exec(`ALTER TABLE addresses ADD COLUMN ${name} ${definition}`);
  }
  for (const trigger of triggerNames) database.exec(`DROP TRIGGER IF EXISTS ${trigger}`);
  for (const statement of customerAccountSchemaStatements) database.exec(statement);
}

export async function applyCustomerAccountSchemaToLibsql(client) {
  const columns = await libsqlColumns(client, "addresses");
  for (const [name, definition] of addressColumns) {
    if (!columns.has(name)) await client.execute(`ALTER TABLE addresses ADD COLUMN ${name} ${definition}`);
  }
  for (const trigger of triggerNames) await client.execute(`DROP TRIGGER IF EXISTS ${trigger}`);
  for (const statement of customerAccountSchemaStatements) await client.execute(statement);
}
