export const securitySchemaStatements = [
  `CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_user_id INTEGER,
    action TEXT NOT NULL CHECK(length(action) BETWEEN 1 AND 100),
    target_type TEXT CHECK(target_type IS NULL OR length(target_type) <= 50),
    target_id TEXT CHECK(target_id IS NULL OR length(target_id) <= 100),
    outcome TEXT NOT NULL CHECK(outcome IN ('allowed', 'denied', 'failed', 'succeeded')),
    request_id TEXT NOT NULL CHECK(length(request_id) BETWEEN 1 AND 200),
    ip_hash TEXT NOT NULL CHECK(length(ip_hash) = 64),
    metadata TEXT CHECK(metadata IS NULL OR length(metadata) <= 4000),
    created_at TEXT NOT NULL,
    FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
  )`,
  `CREATE TABLE IF NOT EXISTS rate_limits (
    key TEXT PRIMARY KEY CHECK(length(key) = 64),
    scope TEXT NOT NULL CHECK(length(scope) BETWEEN 1 AND 100),
    request_count INTEGER NOT NULL CHECK(request_count >= 1),
    window_started_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL CHECK(expires_at > window_started_at),
    updated_at TEXT NOT NULL
  )`,
  "CREATE INDEX IF NOT EXISTS audit_logs_actor_created_index ON audit_logs(actor_user_id, created_at)",
  "CREATE INDEX IF NOT EXISTS audit_logs_action_created_index ON audit_logs(action, created_at)",
  "CREATE INDEX IF NOT EXISTS rate_limits_expires_index ON rate_limits(expires_at)",
  "CREATE UNIQUE INDEX IF NOT EXISTS users_email_casefold_unique ON users(lower(email))",
  "CREATE UNIQUE INDEX IF NOT EXISTS cleaners_user_unique ON cleaners(user_id) WHERE user_id IS NOT NULL",
  "CREATE UNIQUE INDEX IF NOT EXISTS addresses_one_default_per_user ON addresses(user_id) WHERE is_default = 1",
  `CREATE TRIGGER IF NOT EXISTS validate_users_insert BEFORE INSERT ON users BEGIN
    SELECT CASE WHEN length(trim(NEW.name)) NOT BETWEEN 2 AND 100 THEN RAISE(ABORT, 'invalid user name') END;
    SELECT CASE WHEN NEW.email <> lower(trim(NEW.email)) OR length(NEW.email) > 254 OR instr(NEW.email, '@') < 2 THEN RAISE(ABORT, 'invalid email') END;
    SELECT CASE WHEN NEW.role NOT IN ('CUSTOMER', 'VENDOR_OWNER', 'VENDOR_MANAGER', 'VENDOR_STAFF', 'RIDER', 'SUPPORT_AGENT', 'ADMIN', 'SUPER_ADMIN') THEN RAISE(ABORT, 'invalid user role') END;
    SELECT CASE WHEN length(NEW.password) NOT BETWEEN 50 AND 255 THEN RAISE(ABORT, 'invalid password hash') END;
  END`,
  `CREATE TRIGGER IF NOT EXISTS validate_users_update BEFORE UPDATE ON users BEGIN
    SELECT CASE WHEN length(trim(NEW.name)) NOT BETWEEN 2 AND 100 THEN RAISE(ABORT, 'invalid user name') END;
    SELECT CASE WHEN NEW.email <> lower(trim(NEW.email)) OR length(NEW.email) > 254 OR instr(NEW.email, '@') < 2 THEN RAISE(ABORT, 'invalid email') END;
    SELECT CASE WHEN NEW.role NOT IN ('CUSTOMER', 'VENDOR_OWNER', 'VENDOR_MANAGER', 'VENDOR_STAFF', 'RIDER', 'SUPPORT_AGENT', 'ADMIN', 'SUPER_ADMIN') THEN RAISE(ABORT, 'invalid user role') END;
    SELECT CASE WHEN length(NEW.password) NOT BETWEEN 50 AND 255 THEN RAISE(ABORT, 'invalid password hash') END;
  END`,
  `CREATE TRIGGER IF NOT EXISTS validate_cleaners_insert BEFORE INSERT ON cleaners BEGIN
    SELECT CASE WHEN length(trim(NEW.business_name)) NOT BETWEEN 2 AND 120 THEN RAISE(ABORT, 'invalid business name') END;
    SELECT CASE WHEN NEW.contact_name IS NOT NULL AND length(trim(NEW.contact_name)) NOT BETWEEN 2 AND 100 THEN RAISE(ABORT, 'invalid contact name') END;
    SELECT CASE WHEN NEW.business_email IS NOT NULL AND (NEW.business_email <> lower(trim(NEW.business_email)) OR length(NEW.business_email) > 254 OR instr(NEW.business_email, '@') < 2) THEN RAISE(ABORT, 'invalid business email') END;
    SELECT CASE WHEN NEW.state IS NOT NULL AND length(trim(NEW.state)) NOT BETWEEN 2 AND 80 THEN RAISE(ABORT, 'invalid state') END;
    SELECT CASE WHEN NEW.lga IS NOT NULL AND length(trim(NEW.lga)) NOT BETWEEN 2 AND 100 THEN RAISE(ABORT, 'invalid lga') END;
    SELECT CASE WHEN NEW.area IS NOT NULL AND length(trim(NEW.area)) NOT BETWEEN 2 AND 100 THEN RAISE(ABORT, 'invalid area') END;
    SELECT CASE WHEN NEW.description IS NOT NULL AND length(NEW.description) > 2000 THEN RAISE(ABORT, 'description too long') END;
    SELECT CASE WHEN length(trim(NEW.address)) NOT BETWEEN 3 AND 250 OR length(trim(NEW.city)) NOT BETWEEN 2 AND 100 THEN RAISE(ABORT, 'invalid cleaner address') END;
    SELECT CASE WHEN NEW.rating < 0 OR NEW.rating > 5 THEN RAISE(ABORT, 'invalid cleaner rating') END;
    SELECT CASE WHEN NEW.is_available NOT IN (0, 1) OR NEW.is_approved NOT IN (0, 1) THEN RAISE(ABORT, 'invalid cleaner state') END;
    SELECT CASE WHEN NEW.verification_status NOT IN ('draft', 'pending', 'approved', 'needs_changes') THEN RAISE(ABORT, 'invalid verification state') END;
    SELECT CASE WHEN NEW.onboarding_step NOT IN ('business', 'location', 'services', 'verification', 'review', 'submitted') THEN RAISE(ABORT, 'invalid onboarding step') END;
    SELECT CASE WHEN NEW.pickup_radius_km <= 0 OR NEW.pickup_radius_km > 100 OR NEW.delivery_radius_km <= 0 OR NEW.delivery_radius_km > 100 THEN RAISE(ABORT, 'invalid service radius') END;
    SELECT CASE WHEN NEW.latitude IS NOT NULL AND (NEW.latitude < -90 OR NEW.latitude > 90) THEN RAISE(ABORT, 'invalid latitude') END;
    SELECT CASE WHEN NEW.longitude IS NOT NULL AND (NEW.longitude < -180 OR NEW.longitude > 180) THEN RAISE(ABORT, 'invalid longitude') END;
  END`,
  `CREATE TRIGGER IF NOT EXISTS validate_cleaners_update BEFORE UPDATE ON cleaners BEGIN
    SELECT CASE WHEN length(trim(NEW.business_name)) NOT BETWEEN 2 AND 120 THEN RAISE(ABORT, 'invalid business name') END;
    SELECT CASE WHEN NEW.contact_name IS NOT NULL AND length(trim(NEW.contact_name)) NOT BETWEEN 2 AND 100 THEN RAISE(ABORT, 'invalid contact name') END;
    SELECT CASE WHEN NEW.business_email IS NOT NULL AND (NEW.business_email <> lower(trim(NEW.business_email)) OR length(NEW.business_email) > 254 OR instr(NEW.business_email, '@') < 2) THEN RAISE(ABORT, 'invalid business email') END;
    SELECT CASE WHEN NEW.state IS NOT NULL AND length(trim(NEW.state)) NOT BETWEEN 2 AND 80 THEN RAISE(ABORT, 'invalid state') END;
    SELECT CASE WHEN NEW.lga IS NOT NULL AND length(trim(NEW.lga)) NOT BETWEEN 2 AND 100 THEN RAISE(ABORT, 'invalid lga') END;
    SELECT CASE WHEN NEW.area IS NOT NULL AND length(trim(NEW.area)) NOT BETWEEN 2 AND 100 THEN RAISE(ABORT, 'invalid area') END;
    SELECT CASE WHEN NEW.description IS NOT NULL AND length(NEW.description) > 2000 THEN RAISE(ABORT, 'description too long') END;
    SELECT CASE WHEN length(trim(NEW.address)) NOT BETWEEN 3 AND 250 OR length(trim(NEW.city)) NOT BETWEEN 2 AND 100 THEN RAISE(ABORT, 'invalid cleaner address') END;
    SELECT CASE WHEN NEW.rating < 0 OR NEW.rating > 5 THEN RAISE(ABORT, 'invalid cleaner rating') END;
    SELECT CASE WHEN NEW.is_available NOT IN (0, 1) OR NEW.is_approved NOT IN (0, 1) THEN RAISE(ABORT, 'invalid cleaner state') END;
    SELECT CASE WHEN NEW.verification_status NOT IN ('draft', 'pending', 'approved', 'needs_changes') THEN RAISE(ABORT, 'invalid verification state') END;
    SELECT CASE WHEN NEW.onboarding_step NOT IN ('business', 'location', 'services', 'verification', 'review', 'submitted') THEN RAISE(ABORT, 'invalid onboarding step') END;
    SELECT CASE WHEN NEW.pickup_radius_km <= 0 OR NEW.pickup_radius_km > 100 OR NEW.delivery_radius_km <= 0 OR NEW.delivery_radius_km > 100 THEN RAISE(ABORT, 'invalid service radius') END;
    SELECT CASE WHEN NEW.latitude IS NOT NULL AND (NEW.latitude < -90 OR NEW.latitude > 90) THEN RAISE(ABORT, 'invalid latitude') END;
    SELECT CASE WHEN NEW.longitude IS NOT NULL AND (NEW.longitude < -180 OR NEW.longitude > 180) THEN RAISE(ABORT, 'invalid longitude') END;
  END`,
  `CREATE TRIGGER IF NOT EXISTS validate_services_insert BEFORE INSERT ON services BEGIN
    SELECT CASE WHEN length(trim(NEW.name)) NOT BETWEEN 2 AND 120 THEN RAISE(ABORT, 'invalid service name') END;
    SELECT CASE WHEN NEW.price <= 0 OR NEW.price > 10000000 THEN RAISE(ABORT, 'invalid service price') END;
    SELECT CASE WHEN NEW.unit NOT IN ('per_item', 'per_kg', 'per_pair', 'per_set', 'flat_rate') THEN RAISE(ABORT, 'invalid service unit') END;
    SELECT CASE WHEN length(trim(NEW.category)) NOT BETWEEN 2 AND 80 THEN RAISE(ABORT, 'invalid service category') END;
    SELECT CASE WHEN NEW.is_active NOT IN (0, 1) OR NEW.express_available NOT IN (0, 1) THEN RAISE(ABORT, 'invalid service state') END;
  END`,
  `CREATE TRIGGER IF NOT EXISTS validate_services_update BEFORE UPDATE ON services BEGIN
    SELECT CASE WHEN length(trim(NEW.name)) NOT BETWEEN 2 AND 120 THEN RAISE(ABORT, 'invalid service name') END;
    SELECT CASE WHEN NEW.price <= 0 OR NEW.price > 10000000 THEN RAISE(ABORT, 'invalid service price') END;
    SELECT CASE WHEN NEW.unit NOT IN ('per_item', 'per_kg', 'per_pair', 'per_set', 'flat_rate') THEN RAISE(ABORT, 'invalid service unit') END;
    SELECT CASE WHEN length(trim(NEW.category)) NOT BETWEEN 2 AND 80 THEN RAISE(ABORT, 'invalid service category') END;
    SELECT CASE WHEN NEW.is_active NOT IN (0, 1) OR NEW.express_available NOT IN (0, 1) THEN RAISE(ABORT, 'invalid service state') END;
  END`,
  `CREATE TRIGGER IF NOT EXISTS validate_addresses_insert BEFORE INSERT ON addresses BEGIN
    SELECT CASE WHEN length(trim(NEW.address)) NOT BETWEEN 3 AND 250 OR length(trim(NEW.city)) NOT BETWEEN 2 AND 100 THEN RAISE(ABORT, 'invalid address') END;
    SELECT CASE WHEN NEW.is_default NOT IN (0, 1) THEN RAISE(ABORT, 'invalid default address state') END;
    SELECT CASE WHEN NEW.delivery_notes IS NOT NULL AND length(NEW.delivery_notes) > 1000 THEN RAISE(ABORT, 'delivery notes too long') END;
  END`,
  `CREATE TRIGGER IF NOT EXISTS validate_addresses_update BEFORE UPDATE ON addresses BEGIN
    SELECT CASE WHEN length(trim(NEW.address)) NOT BETWEEN 3 AND 250 OR length(trim(NEW.city)) NOT BETWEEN 2 AND 100 THEN RAISE(ABORT, 'invalid address') END;
    SELECT CASE WHEN NEW.is_default NOT IN (0, 1) THEN RAISE(ABORT, 'invalid default address state') END;
    SELECT CASE WHEN NEW.delivery_notes IS NOT NULL AND length(NEW.delivery_notes) > 1000 THEN RAISE(ABORT, 'delivery notes too long') END;
  END`,
  `CREATE TRIGGER IF NOT EXISTS validate_orders_insert BEFORE INSERT ON orders BEGIN
    SELECT CASE WHEN NEW.status NOT IN ('pending', 'accepted', 'picked_up', 'in_cleaning', 'ready', 'out_for_delivery', 'completed', 'cancelled') THEN RAISE(ABORT, 'invalid order status') END;
    SELECT CASE WHEN NEW.payment_status NOT IN ('unpaid', 'pending', 'paid', 'failed', 'refunded') THEN RAISE(ABORT, 'invalid payment status') END;
    SELECT CASE WHEN NEW.subtotal < 0 OR NEW.delivery_fee < 0 OR NEW.platform_fee < 0 OR NEW.total < 0 THEN RAISE(ABORT, 'invalid order amount') END;
  END`,
  `CREATE TRIGGER IF NOT EXISTS validate_orders_update BEFORE UPDATE ON orders BEGIN
    SELECT CASE WHEN NEW.status NOT IN ('pending', 'accepted', 'picked_up', 'in_cleaning', 'ready', 'out_for_delivery', 'completed', 'cancelled') THEN RAISE(ABORT, 'invalid order status') END;
    SELECT CASE WHEN NEW.payment_status NOT IN ('unpaid', 'pending', 'paid', 'failed', 'refunded') THEN RAISE(ABORT, 'invalid payment status') END;
    SELECT CASE WHEN NEW.subtotal < 0 OR NEW.delivery_fee < 0 OR NEW.platform_fee < 0 OR NEW.total < 0 THEN RAISE(ABORT, 'invalid order amount') END;
  END`,
  `CREATE TRIGGER IF NOT EXISTS validate_order_items_insert BEFORE INSERT ON order_items BEGIN
    SELECT CASE WHEN NEW.quantity NOT BETWEEN 1 AND 100 OR NEW.price <= 0 THEN RAISE(ABORT, 'invalid order item') END;
  END`,
  `CREATE TRIGGER IF NOT EXISTS validate_order_items_update BEFORE UPDATE ON order_items BEGIN
    SELECT CASE WHEN NEW.quantity NOT BETWEEN 1 AND 100 OR NEW.price <= 0 THEN RAISE(ABORT, 'invalid order item') END;
  END`,
  `CREATE TRIGGER IF NOT EXISTS validate_reviews_insert BEFORE INSERT ON reviews BEGIN
    SELECT CASE WHEN NEW.rating NOT BETWEEN 1 AND 5 THEN RAISE(ABORT, 'invalid review rating') END;
    SELECT CASE WHEN NEW.comment IS NOT NULL AND length(NEW.comment) > 1000 THEN RAISE(ABORT, 'review comment too long') END;
  END`,
  `CREATE TRIGGER IF NOT EXISTS validate_reviews_update BEFORE UPDATE ON reviews BEGIN
    SELECT CASE WHEN NEW.rating NOT BETWEEN 1 AND 5 THEN RAISE(ABORT, 'invalid review rating') END;
    SELECT CASE WHEN NEW.comment IS NOT NULL AND length(NEW.comment) > 1000 THEN RAISE(ABORT, 'review comment too long') END;
  END`,
  `CREATE TRIGGER IF NOT EXISTS validate_sessions_insert BEFORE INSERT ON js_sessions BEGIN
    SELECT CASE WHEN length(NEW.token_hash) <> 64 THEN RAISE(ABORT, 'invalid session token hash') END;
    SELECT CASE WHEN NEW.expires_at <= NEW.created_at THEN RAISE(ABORT, 'invalid session expiration') END;
  END`,
];

export function applySecuritySchemaToSqlite(database) {
  database.exec("PRAGMA foreign_keys = ON");
  for (const statement of securitySchemaStatements) database.exec(statement);
}

export async function applySecuritySchemaToLibsql(client) {
  await client.execute("PRAGMA foreign_keys = ON");
  for (const statement of securitySchemaStatements) await client.execute(statement);
}
