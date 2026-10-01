const AUTH_TABLE_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS oauth_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    provider TEXT NOT NULL CHECK(provider IN ('google', 'apple')),
    provider_user_id TEXT NOT NULL CHECK(length(provider_user_id) BETWEEN 1 AND 255),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(provider, provider_user_id),
    UNIQUE(provider, user_id)
  )`,
  `CREATE TABLE IF NOT EXISTS auth_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('email_verification', 'password_reset')),
    token_hash TEXT NOT NULL UNIQUE CHECK(length(token_hash) = 64),
    expires_at TEXT NOT NULL,
    consumed_at TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS vendor_memberships (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cleaner_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('VENDOR_OWNER', 'VENDOR_MANAGER', 'VENDOR_STAFF')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (cleaner_id) REFERENCES cleaners(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(cleaner_id, user_id)
  )`,
  "CREATE INDEX IF NOT EXISTS auth_tokens_user_type_index ON auth_tokens(user_id, type, expires_at)",
  "CREATE INDEX IF NOT EXISTS vendor_memberships_user_index ON vendor_memberships(user_id, role)",
];

const ROLE_MIGRATION = `UPDATE users SET role = CASE role
  WHEN 'customer' THEN 'CUSTOMER'
  WHEN 'cleaner' THEN 'VENDOR_OWNER'
  WHEN 'admin' THEN 'ADMIN'
  ELSE role
END`;

function verificationMigrationSql() {
  return [
    ROLE_MIGRATION,
    `UPDATE users
     SET email_verified_at = COALESCE(email_verified_at, updated_at, created_at, CURRENT_TIMESTAMP)
     WHERE email_verified_at IS NULL`,
    `UPDATE users
     SET phone_verified_at = COALESCE(phone_verified_at, updated_at, created_at, CURRENT_TIMESTAMP)
     WHERE phone IS NOT NULL AND role IN ('VENDOR_OWNER', 'VENDOR_MANAGER', 'VENDOR_STAFF', 'RIDER')`,
    `INSERT OR IGNORE INTO vendor_memberships (cleaner_id, user_id, role, created_at, updated_at)
     SELECT id, user_id, 'VENDOR_OWNER', COALESCE(created_at, CURRENT_TIMESTAMP), COALESCE(updated_at, CURRENT_TIMESTAMP)
     FROM cleaners WHERE user_id IS NOT NULL`,
  ];
}

export function applyAuthSchemaToSqlite(database) {
  database.exec("PRAGMA foreign_keys = ON");
  database.exec("DROP TRIGGER IF EXISTS validate_users_insert");
  database.exec("DROP TRIGGER IF EXISTS validate_users_update");
  const columns = database.prepare("PRAGMA table_info(users)").all().map((column) => String(column.name));
  if (!columns.includes("phone_verified_at")) database.exec("ALTER TABLE users ADD COLUMN phone_verified_at TEXT");
  for (const statement of AUTH_TABLE_STATEMENTS) database.exec(statement);
  for (const statement of verificationMigrationSql()) database.exec(statement);
}

export async function applyAuthSchemaToLibsql(client) {
  await client.execute("PRAGMA foreign_keys = ON");
  await client.execute("DROP TRIGGER IF EXISTS validate_users_insert");
  await client.execute("DROP TRIGGER IF EXISTS validate_users_update");
  const columns = await client.execute("PRAGMA table_info(users)");
  if (!columns.rows.some((column) => String(column.name) === "phone_verified_at")) {
    await client.execute("ALTER TABLE users ADD COLUMN phone_verified_at TEXT");
  }
  for (const statement of AUTH_TABLE_STATEMENTS) await client.execute(statement);
  for (const statement of verificationMigrationSql()) await client.execute(statement);
}
