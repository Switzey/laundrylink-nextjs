const cleanerColumns = [
  ["auto_accept_orders", "INTEGER NOT NULL DEFAULT 0"],
  ["daily_weight_capacity", "NUMERIC NOT NULL DEFAULT 500"],
  ["commission_rate", "NUMERIC NOT NULL DEFAULT 10"],
  ["profile_view_count", "INTEGER NOT NULL DEFAULT 0"],
];

const orderColumns = [
  ["branch_id", "INTEGER"],
  ["assigned_user_id", "INTEGER"],
  ["priority", "TEXT NOT NULL DEFAULT 'normal'"],
  ["production_stage", "TEXT NOT NULL DEFAULT 'received'"],
  ["stage_updated_at", "TEXT"],
  ["accepted_at", "TEXT"],
  ["rejected_at", "TEXT"],
  ["rejection_reason", "TEXT"],
];

export const vendorOperationsStatements = [
  `CREATE TABLE IF NOT EXISTS vendor_branches (
    id INTEGER PRIMARY KEY AUTOINCREMENT, cleaner_id INTEGER NOT NULL, name TEXT NOT NULL,
    address TEXT NOT NULL, city TEXT NOT NULL, phone TEXT, opening_hours TEXT,
    daily_order_capacity INTEGER NOT NULL DEFAULT 20, daily_weight_capacity NUMERIC NOT NULL DEFAULT 500,
    is_primary INTEGER NOT NULL DEFAULT 0, is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    FOREIGN KEY (cleaner_id) REFERENCES cleaners(id) ON DELETE CASCADE,
    UNIQUE(cleaner_id, name)
  )`,
  `CREATE TABLE IF NOT EXISTS vendor_staff_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT, cleaner_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
    branch_id INTEGER, responsibility TEXT NOT NULL, is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    FOREIGN KEY (cleaner_id) REFERENCES cleaners(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (branch_id) REFERENCES vendor_branches(id) ON DELETE SET NULL,
    UNIQUE(cleaner_id, user_id)
  )`,
  `CREATE TABLE IF NOT EXISTS branch_services (
    id INTEGER PRIMARY KEY AUTOINCREMENT, branch_id INTEGER NOT NULL, service_id INTEGER NOT NULL,
    price_override NUMERIC, is_active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    FOREIGN KEY (branch_id) REFERENCES vendor_branches(id) ON DELETE CASCADE,
    FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE,
    UNIQUE(branch_id, service_id)
  )`,
  `CREATE TABLE IF NOT EXISTS vendor_invites (
    id INTEGER PRIMARY KEY AUTOINCREMENT, cleaner_id INTEGER NOT NULL, email TEXT NOT NULL,
    account_role TEXT NOT NULL, responsibility TEXT NOT NULL, branch_id INTEGER,
    invited_by_user_id INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending', expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    FOREIGN KEY (cleaner_id) REFERENCES cleaners(id) ON DELETE CASCADE,
    FOREIGN KEY (branch_id) REFERENCES vendor_branches(id) ON DELETE SET NULL,
    FOREIGN KEY (invited_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
  )`,
  `CREATE TABLE IF NOT EXISTS staff_shifts (
    id INTEGER PRIMARY KEY AUTOINCREMENT, cleaner_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
    branch_id INTEGER, starts_at TEXT NOT NULL, ends_at TEXT NOT NULL, notes TEXT,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    FOREIGN KEY (cleaner_id) REFERENCES cleaners(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (branch_id) REFERENCES vendor_branches(id) ON DELETE SET NULL
  )`,
  `CREATE TABLE IF NOT EXISTS vendor_closures (
    id INTEGER PRIMARY KEY AUTOINCREMENT, cleaner_id INTEGER NOT NULL, branch_id INTEGER,
    starts_at TEXT NOT NULL, ends_at TEXT NOT NULL, reason TEXT NOT NULL,
    created_by_user_id INTEGER NOT NULL, created_at TEXT NOT NULL,
    FOREIGN KEY (cleaner_id) REFERENCES cleaners(id) ON DELETE CASCADE,
    FOREIGN KEY (branch_id) REFERENCES vendor_branches(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
  )`,
  `CREATE TABLE IF NOT EXISTS order_stage_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL, stage TEXT NOT NULL,
    user_id INTEGER NOT NULL, notes TEXT, created_at TEXT NOT NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
  )`,
  `CREATE TABLE IF NOT EXISTS garment_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL, tag_code TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL, quantity INTEGER NOT NULL DEFAULT 1, declared_value NUMERIC,
    condition_notes TEXT, stage TEXT NOT NULL DEFAULT 'received', created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS equipment_maintenance (
    id INTEGER PRIMARY KEY AUTOINCREMENT, cleaner_id INTEGER NOT NULL, branch_id INTEGER,
    equipment_name TEXT NOT NULL, status TEXT NOT NULL, scheduled_for TEXT, completed_at TEXT,
    notes TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    FOREIGN KEY (cleaner_id) REFERENCES cleaners(id) ON DELETE CASCADE,
    FOREIGN KEY (branch_id) REFERENCES vendor_branches(id) ON DELETE SET NULL
  )`,
  `CREATE TABLE IF NOT EXISTS order_resolution_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL, requested_by_user_id INTEGER NOT NULL,
    type TEXT NOT NULL, amount NUMERIC, reason TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
    reviewed_by_user_id INTEGER, response TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (requested_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
    FOREIGN KEY (reviewed_by_user_id) REFERENCES users(id) ON DELETE SET NULL
  )`,
  `CREATE TABLE IF NOT EXISTS review_responses (
    id INTEGER PRIMARY KEY AUTOINCREMENT, review_id INTEGER NOT NULL UNIQUE, cleaner_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL, response TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE CASCADE,
    FOREIGN KEY (cleaner_id) REFERENCES cleaners(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
  )`,
  `CREATE INDEX IF NOT EXISTS vendor_branches_cleaner_index ON vendor_branches(cleaner_id, is_active)`,
  `CREATE INDEX IF NOT EXISTS vendor_staff_cleaner_index ON vendor_staff_profiles(cleaner_id, is_active)`,
  `CREATE INDEX IF NOT EXISTS branch_services_branch_index ON branch_services(branch_id, is_active)`,
  `CREATE INDEX IF NOT EXISTS vendor_invites_cleaner_index ON vendor_invites(cleaner_id, status)`,
  `CREATE INDEX IF NOT EXISTS staff_shifts_cleaner_index ON staff_shifts(cleaner_id, starts_at)`,
  `CREATE INDEX IF NOT EXISTS vendor_closures_cleaner_index ON vendor_closures(cleaner_id, starts_at, ends_at)`,
  `CREATE INDEX IF NOT EXISTS order_stage_events_order_index ON order_stage_events(order_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS garment_records_order_index ON garment_records(order_id)`,
  `CREATE INDEX IF NOT EXISTS maintenance_cleaner_index ON equipment_maintenance(cleaner_id, status)`,
  `CREATE INDEX IF NOT EXISTS resolution_order_index ON order_resolution_requests(order_id, status)`,
  `CREATE TRIGGER IF NOT EXISTS validate_vendor_operations_cleaner_update BEFORE UPDATE ON cleaners BEGIN
    SELECT CASE WHEN NEW.auto_accept_orders NOT IN (0,1) THEN RAISE(ABORT,'invalid auto accept state') END;
    SELECT CASE WHEN NEW.daily_weight_capacity <= 0 OR NEW.daily_weight_capacity > 100000 THEN RAISE(ABORT,'invalid daily weight capacity') END;
    SELECT CASE WHEN NEW.commission_rate < 0 OR NEW.commission_rate > 100 THEN RAISE(ABORT,'invalid commission rate') END;
    SELECT CASE WHEN NEW.profile_view_count < 0 THEN RAISE(ABORT,'invalid profile view count') END;
  END`,
  `CREATE TRIGGER IF NOT EXISTS validate_vendor_operations_order_update BEFORE UPDATE ON orders BEGIN
    SELECT CASE WHEN NEW.priority NOT IN ('normal','urgent') THEN RAISE(ABORT,'invalid order priority') END;
    SELECT CASE WHEN NEW.production_stage NOT IN ('received','washing','drying','ironing','inspection','packaging','ready') THEN RAISE(ABORT,'invalid production stage') END;
  END`,
  `CREATE TRIGGER IF NOT EXISTS validate_vendor_branch_insert BEFORE INSERT ON vendor_branches BEGIN
    SELECT CASE WHEN NEW.daily_order_capacity NOT BETWEEN 1 AND 500 OR NEW.daily_weight_capacity <= 0 OR NEW.daily_weight_capacity > 100000 THEN RAISE(ABORT,'invalid branch capacity') END;
    SELECT CASE WHEN NEW.is_primary NOT IN (0,1) OR NEW.is_active NOT IN (0,1) THEN RAISE(ABORT,'invalid branch state') END;
  END`,
  `CREATE TRIGGER IF NOT EXISTS validate_vendor_staff_insert BEFORE INSERT ON vendor_staff_profiles BEGIN
    SELECT CASE WHEN NEW.responsibility NOT IN ('manager','receptionist','cleaner','quality_inspector','dispatcher') THEN RAISE(ABORT,'invalid staff responsibility') END;
    SELECT CASE WHEN NEW.is_active NOT IN (0,1) THEN RAISE(ABORT,'invalid staff state') END;
  END`,
  `CREATE TRIGGER IF NOT EXISTS validate_vendor_invite_insert BEFORE INSERT ON vendor_invites BEGIN
    SELECT CASE WHEN NEW.account_role NOT IN ('VENDOR_MANAGER','VENDOR_STAFF') THEN RAISE(ABORT,'invalid invite role') END;
    SELECT CASE WHEN NEW.responsibility NOT IN ('manager','receptionist','cleaner','quality_inspector','dispatcher') THEN RAISE(ABORT,'invalid invite responsibility') END;
    SELECT CASE WHEN NEW.status NOT IN ('pending','accepted','expired','revoked') THEN RAISE(ABORT,'invalid invite status') END;
  END`,
  `CREATE TRIGGER IF NOT EXISTS validate_vendor_closure_insert BEFORE INSERT ON vendor_closures BEGIN
    SELECT CASE WHEN NEW.ends_at <= NEW.starts_at OR length(trim(NEW.reason)) < 2 THEN RAISE(ABORT,'invalid closure') END;
  END`,
  `CREATE TRIGGER IF NOT EXISTS validate_branch_service_insert BEFORE INSERT ON branch_services BEGIN
    SELECT CASE WHEN NEW.price_override IS NOT NULL AND (NEW.price_override <= 0 OR NEW.price_override > 10000000) THEN RAISE(ABORT,'invalid branch price') END;
    SELECT CASE WHEN NEW.is_active NOT IN (0,1) THEN RAISE(ABORT,'invalid branch service state') END;
  END`,
  `CREATE TRIGGER IF NOT EXISTS validate_garment_record_insert BEFORE INSERT ON garment_records BEGIN
    SELECT CASE WHEN NEW.quantity NOT BETWEEN 1 AND 1000 OR NEW.declared_value < 0 THEN RAISE(ABORT,'invalid garment record') END;
  END`,
  `CREATE TRIGGER IF NOT EXISTS validate_maintenance_insert BEFORE INSERT ON equipment_maintenance BEGIN
    SELECT CASE WHEN NEW.status NOT IN ('scheduled','in_progress','completed','out_of_service') THEN RAISE(ABORT,'invalid maintenance status') END;
  END`,
  `CREATE TRIGGER IF NOT EXISTS validate_resolution_insert BEFORE INSERT ON order_resolution_requests BEGIN
    SELECT CASE WHEN NEW.type NOT IN ('refund','compensation','amendment','dispute') OR NEW.status NOT IN ('pending','approved','rejected') THEN RAISE(ABORT,'invalid resolution request') END;
    SELECT CASE WHEN NEW.amount < 0 OR length(trim(NEW.reason)) < 10 THEN RAISE(ABORT,'invalid resolution details') END;
  END`,
];

function sqliteColumns(database, table) {
  return new Set(database.prepare(`PRAGMA table_info("${table}")`).all().map((column) => String(column.name)));
}

async function libsqlColumns(client, table) {
  const result = await client.execute(`PRAGMA table_info("${table}")`);
  return new Set(result.rows.map((column) => String(column.name)));
}

export function applyVendorOperationsSchemaToSqlite(database) {
  const cleaners = sqliteColumns(database, "cleaners");
  for (const [name, definition] of cleanerColumns) if (!cleaners.has(name)) database.exec(`ALTER TABLE cleaners ADD COLUMN ${name} ${definition}`);
  const orders = sqliteColumns(database, "orders");
  for (const [name, definition] of orderColumns) if (!orders.has(name)) database.exec(`ALTER TABLE orders ADD COLUMN ${name} ${definition}`);
  for (const statement of vendorOperationsStatements) database.exec(statement);
}

export async function applyVendorOperationsSchemaToLibsql(client) {
  const cleaners = await libsqlColumns(client, "cleaners");
  for (const [name, definition] of cleanerColumns) if (!cleaners.has(name)) await client.execute(`ALTER TABLE cleaners ADD COLUMN ${name} ${definition}`);
  const orders = await libsqlColumns(client, "orders");
  for (const [name, definition] of orderColumns) if (!orders.has(name)) await client.execute(`ALTER TABLE orders ADD COLUMN ${name} ${definition}`);
  for (const statement of vendorOperationsStatements) await client.execute(statement);
}
