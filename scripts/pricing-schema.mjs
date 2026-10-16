const cleanerColumns = [
  ["minimum_order_amount", "NUMERIC NOT NULL DEFAULT 0"],
  ["delivery_pricing_type", "TEXT NOT NULL DEFAULT 'fixed'"],
  ["base_delivery_fee", "NUMERIC NOT NULL DEFAULT 1500"],
  ["delivery_fee_per_km", "NUMERIC NOT NULL DEFAULT 0"],
  ["free_delivery_threshold", "NUMERIC"],
];

const serviceColumns = [
  ["express_fee_type", "TEXT NOT NULL DEFAULT 'fixed'"],
  ["express_fee_value", "NUMERIC NOT NULL DEFAULT 0"],
  ["special_treatment_available", "INTEGER NOT NULL DEFAULT 0"],
  ["special_treatment_fee", "NUMERIC NOT NULL DEFAULT 0"],
  ["minimum_quantity", "NUMERIC NOT NULL DEFAULT 1"],
  ["quantity_step", "NUMERIC NOT NULL DEFAULT 1"],
  ["package_details", "TEXT"],
  ["requires_final_confirmation", "INTEGER NOT NULL DEFAULT 0"],
  ["price_version", "INTEGER NOT NULL DEFAULT 1"],
];

const orderColumns = [
  ["discount_amount", "NUMERIC NOT NULL DEFAULT 0"],
  ["express_fee", "NUMERIC NOT NULL DEFAULT 0"],
  ["special_treatment_fee", "NUMERIC NOT NULL DEFAULT 0"],
  ["pricing_status", "TEXT NOT NULL DEFAULT 'final'"],
  ["pricing_confirmed_at", "TEXT"],
  ["estimated_total", "NUMERIC"],
  ["delivery_pricing_snapshot", "TEXT"],
  ["pending_pricing_snapshot", "TEXT"],
];

const orderItemColumns = [
  ["service_name", "TEXT"],
  ["category_snapshot", "TEXT"],
  ["unit", "TEXT"],
  ["estimated_quantity", "NUMERIC"],
  ["confirmed_quantity", "NUMERIC"],
  ["base_subtotal", "NUMERIC NOT NULL DEFAULT 0"],
  ["discount_amount", "NUMERIC NOT NULL DEFAULT 0"],
  ["express_fee", "NUMERIC NOT NULL DEFAULT 0"],
  ["special_treatment_fee", "NUMERIC NOT NULL DEFAULT 0"],
  ["line_total", "NUMERIC NOT NULL DEFAULT 0"],
  ["bulk_discount_rules", "TEXT NOT NULL DEFAULT '[]'"],
  ["pricing_snapshot", "TEXT NOT NULL DEFAULT '{}'"],
  ["requires_final_confirmation", "INTEGER NOT NULL DEFAULT 0"],
  ["pricing_status", "TEXT NOT NULL DEFAULT 'final'"],
];

export const pricingSchemaStatements = [
  `CREATE TABLE IF NOT EXISTS service_bulk_discounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    service_id INTEGER NOT NULL,
    minimum_quantity NUMERIC NOT NULL,
    discount_type TEXT NOT NULL,
    discount_value NUMERIC NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE,
    CHECK(minimum_quantity > 0 AND minimum_quantity <= 10000),
    CHECK(discount_type IN ('percentage', 'fixed')),
    CHECK(discount_value > 0 AND discount_value <= 10000000),
    CHECK(discount_type <> 'percentage' OR discount_value <= 100),
    CHECK(is_active IN (0, 1))
  )`,
  `CREATE TABLE IF NOT EXISTS delivery_zones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cleaner_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    pricing_type TEXT NOT NULL DEFAULT 'fixed',
    base_fee NUMERIC NOT NULL DEFAULT 0,
    per_km_fee NUMERIC NOT NULL DEFAULT 0,
    minimum_fee NUMERIC NOT NULL DEFAULT 0,
    maximum_fee NUMERIC,
    radius_km NUMERIC,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (cleaner_id) REFERENCES cleaners(id) ON DELETE CASCADE,
    CHECK(length(trim(name)) BETWEEN 2 AND 100),
    CHECK(pricing_type IN ('fixed', 'distance', 'free')),
    CHECK(base_fee >= 0 AND per_km_fee >= 0 AND minimum_fee >= 0),
    CHECK(maximum_fee IS NULL OR maximum_fee >= minimum_fee),
    CHECK(radius_km IS NULL OR (radius_km > 0 AND radius_km <= 250)),
    CHECK(is_active IN (0, 1))
  )`,
  `CREATE TABLE IF NOT EXISTS service_price_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    service_id INTEGER NOT NULL,
    price_version INTEGER NOT NULL,
    price NUMERIC NOT NULL,
    unit TEXT NOT NULL,
    express_fee_type TEXT NOT NULL,
    express_fee_value NUMERIC NOT NULL,
    special_treatment_fee NUMERIC NOT NULL,
    changed_by_user_id INTEGER,
    change_reason TEXT,
    requires_review INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE,
    FOREIGN KEY (changed_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
    CHECK(price_version > 0),
    CHECK(price > 0),
    CHECK(requires_review IN (0, 1))
  )`,
  "CREATE UNIQUE INDEX IF NOT EXISTS services_cleaner_name_unique ON services(cleaner_id, lower(name))",
  "CREATE UNIQUE INDEX IF NOT EXISTS service_bulk_discounts_threshold_unique ON service_bulk_discounts(service_id, minimum_quantity)",
  "CREATE INDEX IF NOT EXISTS service_bulk_discounts_active_index ON service_bulk_discounts(service_id, is_active, minimum_quantity)",
  "CREATE INDEX IF NOT EXISTS delivery_zones_cleaner_active_index ON delivery_zones(cleaner_id, is_active)",
  "CREATE INDEX IF NOT EXISTS service_price_history_service_version_index ON service_price_history(service_id, price_version)",
  `CREATE TRIGGER IF NOT EXISTS validate_pricing_services_insert BEFORE INSERT ON services BEGIN
    SELECT CASE WHEN NEW.express_fee_type NOT IN ('fixed', 'percentage') THEN RAISE(ABORT, 'invalid express fee type') END;
    SELECT CASE WHEN NEW.express_fee_value < 0 OR NEW.express_fee_value > 10000000 OR (NEW.express_fee_type = 'percentage' AND NEW.express_fee_value > 100) THEN RAISE(ABORT, 'invalid express fee') END;
    SELECT CASE WHEN NEW.special_treatment_available NOT IN (0, 1) OR NEW.special_treatment_fee < 0 OR NEW.special_treatment_fee > 10000000 THEN RAISE(ABORT, 'invalid treatment fee') END;
    SELECT CASE WHEN NEW.minimum_quantity <= 0 OR NEW.minimum_quantity > 10000 OR NEW.quantity_step <= 0 OR NEW.quantity_step > 10000 THEN RAISE(ABORT, 'invalid service quantity configuration') END;
    SELECT CASE WHEN NEW.requires_final_confirmation NOT IN (0, 1) OR NEW.price_version < 1 THEN RAISE(ABORT, 'invalid service pricing state') END;
  END`,
  `CREATE TRIGGER IF NOT EXISTS validate_pricing_services_update BEFORE UPDATE ON services BEGIN
    SELECT CASE WHEN NEW.express_fee_type NOT IN ('fixed', 'percentage') THEN RAISE(ABORT, 'invalid express fee type') END;
    SELECT CASE WHEN NEW.express_fee_value < 0 OR NEW.express_fee_value > 10000000 OR (NEW.express_fee_type = 'percentage' AND NEW.express_fee_value > 100) THEN RAISE(ABORT, 'invalid express fee') END;
    SELECT CASE WHEN NEW.special_treatment_available NOT IN (0, 1) OR NEW.special_treatment_fee < 0 OR NEW.special_treatment_fee > 10000000 THEN RAISE(ABORT, 'invalid treatment fee') END;
    SELECT CASE WHEN NEW.minimum_quantity <= 0 OR NEW.minimum_quantity > 10000 OR NEW.quantity_step <= 0 OR NEW.quantity_step > 10000 THEN RAISE(ABORT, 'invalid service quantity configuration') END;
    SELECT CASE WHEN NEW.requires_final_confirmation NOT IN (0, 1) OR NEW.price_version < 1 THEN RAISE(ABORT, 'invalid service pricing state') END;
  END`,
  `CREATE TRIGGER IF NOT EXISTS service_price_history_update AFTER UPDATE OF price, unit, express_fee_type, express_fee_value, special_treatment_fee ON services
    WHEN OLD.price <> NEW.price OR OLD.unit <> NEW.unit OR OLD.express_fee_type <> NEW.express_fee_type OR OLD.express_fee_value <> NEW.express_fee_value OR OLD.special_treatment_fee <> NEW.special_treatment_fee
    BEGIN
      INSERT INTO service_price_history (service_id, price_version, price, unit, express_fee_type, express_fee_value, special_treatment_fee, requires_review, created_at)
      VALUES (OLD.id, OLD.price_version, OLD.price, OLD.unit, OLD.express_fee_type, OLD.express_fee_value, OLD.special_treatment_fee,
        CASE WHEN NEW.price > OLD.price * 2 OR NEW.price < OLD.price * 0.5 THEN 1 ELSE 0 END, COALESCE(NEW.updated_at, CURRENT_TIMESTAMP));
    END`,
];

const triggerNames = ["validate_pricing_services_insert", "validate_pricing_services_update", "service_price_history_update"];

function sqliteColumns(database, table) {
  return new Set(database.prepare(`PRAGMA table_info("${table}")`).all().map((column) => String(column.name)));
}

async function libsqlColumns(client, table) {
  const result = await client.execute(`PRAGMA table_info("${table}")`);
  return new Set(result.rows.map((column) => String(column.name)));
}

function addSqliteColumns(database, table, definitions) {
  const columns = sqliteColumns(database, table);
  for (const [name, definition] of definitions) {
    if (!columns.has(name)) database.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
  }
}

async function addLibsqlColumns(client, table, definitions) {
  const columns = await libsqlColumns(client, table);
  for (const [name, definition] of definitions) {
    if (!columns.has(name)) await client.execute(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
  }
}

function backfillSqlite(database) {
  database.exec(`UPDATE services SET quantity_step = CASE WHEN quantity_step = 1 THEN 0.1 ELSE quantity_step END,
    requires_final_confirmation = CASE WHEN requires_final_confirmation = 0 THEN 1 ELSE requires_final_confirmation END
    WHERE unit = 'per_kg' AND (quantity_step = 1 OR requires_final_confirmation = 0)`);
  database.exec(`UPDATE order_items SET
    service_name = COALESCE(service_name, (SELECT name FROM services WHERE services.id = order_items.service_id), 'Service'),
    category_snapshot = COALESCE(category_snapshot, (SELECT category FROM services WHERE services.id = order_items.service_id), 'general'),
    unit = COALESCE(unit, (SELECT unit FROM services WHERE services.id = order_items.service_id), 'per_item'),
    estimated_quantity = COALESCE(estimated_quantity, quantity), confirmed_quantity = COALESCE(confirmed_quantity, quantity),
    base_subtotal = CASE WHEN base_subtotal = 0 THEN price * quantity ELSE base_subtotal END,
    line_total = CASE WHEN line_total = 0 THEN price * quantity ELSE line_total END`);
  database.exec("UPDATE orders SET estimated_total = COALESCE(estimated_total, total), pricing_confirmed_at = COALESCE(pricing_confirmed_at, created_at) WHERE pricing_status = 'final'");
}

async function backfillLibsql(client) {
  await client.execute(`UPDATE services SET quantity_step = CASE WHEN quantity_step = 1 THEN 0.1 ELSE quantity_step END,
    requires_final_confirmation = CASE WHEN requires_final_confirmation = 0 THEN 1 ELSE requires_final_confirmation END
    WHERE unit = 'per_kg' AND (quantity_step = 1 OR requires_final_confirmation = 0)`);
  await client.execute(`UPDATE order_items SET
    service_name = COALESCE(service_name, (SELECT name FROM services WHERE services.id = order_items.service_id), 'Service'),
    category_snapshot = COALESCE(category_snapshot, (SELECT category FROM services WHERE services.id = order_items.service_id), 'general'),
    unit = COALESCE(unit, (SELECT unit FROM services WHERE services.id = order_items.service_id), 'per_item'),
    estimated_quantity = COALESCE(estimated_quantity, quantity), confirmed_quantity = COALESCE(confirmed_quantity, quantity),
    base_subtotal = CASE WHEN base_subtotal = 0 THEN price * quantity ELSE base_subtotal END,
    line_total = CASE WHEN line_total = 0 THEN price * quantity ELSE line_total END`);
  await client.execute("UPDATE orders SET estimated_total = COALESCE(estimated_total, total), pricing_confirmed_at = COALESCE(pricing_confirmed_at, created_at) WHERE pricing_status = 'final'");
}

export function applyPricingSchemaToSqlite(database) {
  addSqliteColumns(database, "cleaners", cleanerColumns);
  addSqliteColumns(database, "services", serviceColumns);
  addSqliteColumns(database, "orders", orderColumns);
  addSqliteColumns(database, "order_items", orderItemColumns);
  for (const trigger of triggerNames) database.exec(`DROP TRIGGER IF EXISTS ${trigger}`);
  for (const statement of pricingSchemaStatements) database.exec(statement);
  backfillSqlite(database);
}

export async function applyPricingSchemaToLibsql(client) {
  await addLibsqlColumns(client, "cleaners", cleanerColumns);
  await addLibsqlColumns(client, "services", serviceColumns);
  await addLibsqlColumns(client, "orders", orderColumns);
  await addLibsqlColumns(client, "order_items", orderItemColumns);
  for (const trigger of triggerNames) await client.execute(`DROP TRIGGER IF EXISTS ${trigger}`);
  for (const statement of pricingSchemaStatements) await client.execute(statement);
  await backfillLibsql(client);
}
