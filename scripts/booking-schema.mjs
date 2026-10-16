const orderColumns = [
  ["order_number", "TEXT"],
  ["booking_expires_at", "TEXT"],
  ["confirmed_at", "TEXT"],
  ["payment_method", "TEXT NOT NULL DEFAULT 'pay_on_pickup'"],
  ["is_express", "INTEGER NOT NULL DEFAULT 0"],
  ["voucher_discount_amount", "NUMERIC NOT NULL DEFAULT 0"],
  ["voucher_code", "TEXT"],
  ["quoted_total", "NUMERIC"],
  ["cancelled_at", "TEXT"],
  ["cancellation_reason", "TEXT"],
];

const cleanerColumns = [
  ["daily_order_capacity", "INTEGER NOT NULL DEFAULT 20"],
  ["express_daily_capacity", "INTEGER NOT NULL DEFAULT 5"],
  ["minimum_lead_hours", "INTEGER NOT NULL DEFAULT 2"],
  ["express_turnaround_hours", "INTEGER NOT NULL DEFAULT 12"],
  ["booking_hold_minutes", "INTEGER NOT NULL DEFAULT 30"],
];

export const bookingSchemaStatements = [
  `CREATE TABLE IF NOT EXISTS vouchers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    cleaner_id INTEGER,
    discount_type TEXT NOT NULL,
    discount_value NUMERIC NOT NULL,
    minimum_subtotal NUMERIC NOT NULL DEFAULT 0,
    maximum_discount NUMERIC,
    starts_at TEXT,
    expires_at TEXT,
    usage_limit INTEGER,
    per_user_limit INTEGER NOT NULL DEFAULT 1,
    times_used INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (cleaner_id) REFERENCES cleaners(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS voucher_redemptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    voucher_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    order_id INTEGER NOT NULL UNIQUE,
    discount_amount NUMERIC NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (voucher_id) REFERENCES vouchers(id) ON DELETE RESTRICT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS order_attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    customer_id INTEGER NOT NULL,
    filename TEXT NOT NULL,
    media_type TEXT NOT NULL,
    size INTEGER NOT NULL,
    sha256 TEXT NOT NULL,
    contents BLOB NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS order_price_adjustments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    proposed_by_user_id INTEGER NOT NULL,
    previous_total NUMERIC NOT NULL,
    proposed_total NUMERIC NOT NULL,
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    responded_by_user_id INTEGER,
    created_at TEXT NOT NULL,
    responded_at TEXT,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (proposed_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
    FOREIGN KEY (responded_by_user_id) REFERENCES users(id) ON DELETE SET NULL
  )`,
  "CREATE UNIQUE INDEX IF NOT EXISTS orders_order_number_unique ON orders(order_number) WHERE order_number IS NOT NULL",
  "CREATE INDEX IF NOT EXISTS orders_booking_slot_index ON orders(cleaner_id, pickup_date, pickup_time_window, status, booking_expires_at)",
  "CREATE INDEX IF NOT EXISTS order_attachments_order_index ON order_attachments(order_id)",
  "CREATE INDEX IF NOT EXISTS vouchers_availability_index ON vouchers(code, is_active, starts_at, expires_at)",
  "CREATE INDEX IF NOT EXISTS voucher_redemptions_user_index ON voucher_redemptions(voucher_id, user_id)",
  "CREATE UNIQUE INDEX IF NOT EXISTS order_price_adjustments_one_pending ON order_price_adjustments(order_id) WHERE status = 'pending'",
  `CREATE TRIGGER IF NOT EXISTS validate_booking_order_insert BEFORE INSERT ON orders BEGIN
    SELECT CASE WHEN NEW.payment_method NOT IN ('pay_on_pickup', 'online') THEN RAISE(ABORT, 'invalid payment method') END;
    SELECT CASE WHEN NEW.is_express NOT IN (0, 1) THEN RAISE(ABORT, 'invalid express state') END;
    SELECT CASE WHEN NEW.voucher_discount_amount < 0 OR NEW.voucher_discount_amount > NEW.subtotal THEN RAISE(ABORT, 'invalid voucher discount amount') END;
    SELECT CASE WHEN NEW.quoted_total IS NOT NULL AND NEW.quoted_total < 0 THEN RAISE(ABORT, 'invalid quoted total') END;
  END`,
  `CREATE TRIGGER IF NOT EXISTS validate_booking_order_update BEFORE UPDATE ON orders BEGIN
    SELECT CASE WHEN NEW.payment_method NOT IN ('pay_on_pickup', 'online') THEN RAISE(ABORT, 'invalid payment method') END;
    SELECT CASE WHEN NEW.is_express NOT IN (0, 1) THEN RAISE(ABORT, 'invalid express state') END;
    SELECT CASE WHEN NEW.voucher_discount_amount < 0 OR NEW.voucher_discount_amount > NEW.subtotal THEN RAISE(ABORT, 'invalid voucher discount amount') END;
    SELECT CASE WHEN NEW.total > OLD.total AND NOT EXISTS (
      SELECT 1 FROM order_price_adjustments a
      WHERE a.order_id = OLD.id AND a.status = 'accepted' AND a.proposed_total = NEW.total
    ) THEN RAISE(ABORT, 'customer approval required for price increase') END;
  END`,
  `CREATE TRIGGER IF NOT EXISTS validate_cleaner_booking_capacity_insert BEFORE INSERT ON cleaners BEGIN
    SELECT CASE WHEN NEW.daily_order_capacity NOT BETWEEN 1 AND 500 THEN RAISE(ABORT, 'invalid daily capacity') END;
    SELECT CASE WHEN NEW.express_daily_capacity NOT BETWEEN 0 AND NEW.daily_order_capacity THEN RAISE(ABORT, 'invalid express capacity') END;
    SELECT CASE WHEN NEW.minimum_lead_hours NOT BETWEEN 0 AND 168 THEN RAISE(ABORT, 'invalid minimum lead time') END;
    SELECT CASE WHEN NEW.express_turnaround_hours NOT BETWEEN 1 AND 168 THEN RAISE(ABORT, 'invalid express turnaround') END;
    SELECT CASE WHEN NEW.booking_hold_minutes NOT BETWEEN 5 AND 120 THEN RAISE(ABORT, 'invalid booking hold') END;
  END`,
  `CREATE TRIGGER IF NOT EXISTS validate_cleaner_booking_capacity_update BEFORE UPDATE ON cleaners BEGIN
    SELECT CASE WHEN NEW.daily_order_capacity NOT BETWEEN 1 AND 500 THEN RAISE(ABORT, 'invalid daily capacity') END;
    SELECT CASE WHEN NEW.express_daily_capacity NOT BETWEEN 0 AND NEW.daily_order_capacity THEN RAISE(ABORT, 'invalid express capacity') END;
    SELECT CASE WHEN NEW.minimum_lead_hours NOT BETWEEN 0 AND 168 THEN RAISE(ABORT, 'invalid minimum lead time') END;
    SELECT CASE WHEN NEW.express_turnaround_hours NOT BETWEEN 1 AND 168 THEN RAISE(ABORT, 'invalid express turnaround') END;
    SELECT CASE WHEN NEW.booking_hold_minutes NOT BETWEEN 5 AND 120 THEN RAISE(ABORT, 'invalid booking hold') END;
  END`,
  `CREATE TRIGGER IF NOT EXISTS validate_voucher_insert BEFORE INSERT ON vouchers BEGIN
    SELECT CASE WHEN NEW.code <> upper(trim(NEW.code)) OR length(NEW.code) NOT BETWEEN 3 AND 32 THEN RAISE(ABORT, 'invalid voucher code') END;
    SELECT CASE WHEN NEW.discount_type NOT IN ('fixed', 'percent') THEN RAISE(ABORT, 'invalid voucher type') END;
    SELECT CASE WHEN NEW.discount_value <= 0 OR (NEW.discount_type = 'percent' AND NEW.discount_value > 100) THEN RAISE(ABORT, 'invalid voucher value') END;
    SELECT CASE WHEN NEW.is_active NOT IN (0, 1) OR NEW.times_used < 0 OR NEW.per_user_limit < 1 THEN RAISE(ABORT, 'invalid voucher state') END;
  END`,
  `CREATE TRIGGER IF NOT EXISTS validate_voucher_update BEFORE UPDATE ON vouchers BEGIN
    SELECT CASE WHEN NEW.code <> upper(trim(NEW.code)) OR length(NEW.code) NOT BETWEEN 3 AND 32 THEN RAISE(ABORT, 'invalid voucher code') END;
    SELECT CASE WHEN NEW.discount_type NOT IN ('fixed', 'percent') THEN RAISE(ABORT, 'invalid voucher type') END;
    SELECT CASE WHEN NEW.discount_value <= 0 OR (NEW.discount_type = 'percent' AND NEW.discount_value > 100) THEN RAISE(ABORT, 'invalid voucher value') END;
    SELECT CASE WHEN NEW.is_active NOT IN (0, 1) OR NEW.times_used < 0 OR NEW.per_user_limit < 1 THEN RAISE(ABORT, 'invalid voucher state') END;
  END`,
  `CREATE TRIGGER IF NOT EXISTS validate_order_attachment_insert BEFORE INSERT ON order_attachments BEGIN
    SELECT CASE WHEN NEW.media_type NOT IN ('image/jpeg', 'image/png', 'image/webp') THEN RAISE(ABORT, 'invalid attachment type') END;
    SELECT CASE WHEN NEW.size < 1 OR NEW.size > 5242880 THEN RAISE(ABORT, 'invalid attachment size') END;
    SELECT CASE WHEN length(NEW.filename) NOT BETWEEN 1 AND 180 OR length(NEW.sha256) <> 64 THEN RAISE(ABORT, 'invalid attachment metadata') END;
  END`,
  `CREATE TRIGGER IF NOT EXISTS validate_price_adjustment_insert BEFORE INSERT ON order_price_adjustments BEGIN
    SELECT CASE WHEN NEW.status NOT IN ('pending', 'accepted', 'rejected', 'withdrawn') THEN RAISE(ABORT, 'invalid adjustment status') END;
    SELECT CASE WHEN NEW.proposed_total <= NEW.previous_total THEN RAISE(ABORT, 'adjustment must increase total') END;
    SELECT CASE WHEN length(trim(NEW.reason)) NOT BETWEEN 10 AND 500 THEN RAISE(ABORT, 'invalid adjustment reason') END;
  END`,
  `CREATE TRIGGER IF NOT EXISTS validate_price_adjustment_update BEFORE UPDATE ON order_price_adjustments BEGIN
    SELECT CASE WHEN NEW.status NOT IN ('pending', 'accepted', 'rejected', 'withdrawn') THEN RAISE(ABORT, 'invalid adjustment status') END;
    SELECT CASE WHEN OLD.status <> 'pending' AND NEW.status <> OLD.status THEN RAISE(ABORT, 'adjustment already resolved') END;
    SELECT CASE WHEN NEW.proposed_total <= NEW.previous_total THEN RAISE(ABORT, 'adjustment must increase total') END;
  END`,
];

const triggerNames = [
  "validate_booking_order_insert",
  "validate_booking_order_update",
  "validate_cleaner_booking_capacity_insert",
  "validate_cleaner_booking_capacity_update",
  "validate_voucher_insert",
  "validate_voucher_update",
  "validate_order_attachment_insert",
  "validate_price_adjustment_insert",
  "validate_price_adjustment_update",
];

function sqliteColumns(database, table) {
  return new Set(database.prepare(`PRAGMA table_info("${table}")`).all().map((column) => String(column.name)));
}

async function libsqlColumns(client, table) {
  const result = await client.execute(`PRAGMA table_info("${table}")`);
  return new Set(result.rows.map((column) => String(column.name)));
}

export function applyBookingSchemaToSqlite(database) {
  const orderColumnNames = sqliteColumns(database, "orders");
  for (const [name, definition] of orderColumns) {
    if (!orderColumnNames.has(name)) database.exec(`ALTER TABLE orders ADD COLUMN ${name} ${definition}`);
  }
  const cleanerColumnNames = sqliteColumns(database, "cleaners");
  for (const [name, definition] of cleanerColumns) {
    if (!cleanerColumnNames.has(name)) database.exec(`ALTER TABLE cleaners ADD COLUMN ${name} ${definition}`);
  }
  for (const trigger of triggerNames) database.exec(`DROP TRIGGER IF EXISTS ${trigger}`);
  for (const statement of bookingSchemaStatements) database.exec(statement);
  database.exec("UPDATE orders SET quoted_total = total WHERE quoted_total IS NULL");
}

export async function applyBookingSchemaToLibsql(client) {
  const orderColumnNames = await libsqlColumns(client, "orders");
  for (const [name, definition] of orderColumns) {
    if (!orderColumnNames.has(name)) await client.execute(`ALTER TABLE orders ADD COLUMN ${name} ${definition}`);
  }
  const cleanerColumnNames = await libsqlColumns(client, "cleaners");
  for (const [name, definition] of cleanerColumns) {
    if (!cleanerColumnNames.has(name)) await client.execute(`ALTER TABLE cleaners ADD COLUMN ${name} ${definition}`);
  }
  for (const trigger of triggerNames) await client.execute(`DROP TRIGGER IF EXISTS ${trigger}`);
  for (const statement of bookingSchemaStatements) await client.execute(statement);
  await client.execute("UPDATE orders SET quoted_total = total WHERE quoted_total IS NULL");
}
