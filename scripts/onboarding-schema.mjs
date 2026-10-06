const cleanerColumns = [
  ["contact_name", "TEXT"],
  ["business_email", "TEXT"],
  ["state", "TEXT"],
  ["lga", "TEXT"],
  ["area", "TEXT"],
  ["latitude", "REAL"],
  ["longitude", "REAL"],
  ["pickup_radius_km", "REAL NOT NULL DEFAULT 5"],
  ["delivery_radius_km", "REAL NOT NULL DEFAULT 10"],
  ["verification_status", "TEXT NOT NULL DEFAULT 'draft'"],
  ["onboarding_step", "TEXT NOT NULL DEFAULT 'business'"],
  ["submitted_at", "TEXT"],
  ["approved_at", "TEXT"],
];

const serviceColumns = [
  ["category", "TEXT NOT NULL DEFAULT 'general'"],
  ["turnaround_time", "TEXT"],
  ["express_available", "INTEGER NOT NULL DEFAULT 0"],
];

export const onboardingSchemaStatements = [
  `CREATE TABLE IF NOT EXISTS vendor_verifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cleaner_id INTEGER NOT NULL UNIQUE,
    identity_type TEXT,
    identity_number_encrypted TEXT,
    business_registration_number TEXT,
    bank_name TEXT,
    bank_account_name TEXT,
    bank_account_number_encrypted TEXT,
    information_confirmed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (cleaner_id) REFERENCES cleaners(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS vendor_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cleaner_id INTEGER NOT NULL,
    kind TEXT NOT NULL,
    filename TEXT NOT NULL,
    media_type TEXT NOT NULL,
    size INTEGER NOT NULL,
    sha256 TEXT NOT NULL,
    contents BLOB NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (cleaner_id) REFERENCES cleaners(id) ON DELETE CASCADE,
    UNIQUE (cleaner_id, kind)
  )`,
  "CREATE INDEX IF NOT EXISTS vendor_files_cleaner_index ON vendor_files(cleaner_id)",
  "CREATE UNIQUE INDEX IF NOT EXISTS services_cleaner_name_unique ON services(cleaner_id, lower(name))",
  `CREATE TRIGGER IF NOT EXISTS validate_vendor_verifications_insert BEFORE INSERT ON vendor_verifications BEGIN
    SELECT CASE WHEN NEW.identity_type IS NOT NULL AND NEW.identity_type NOT IN ('nin', 'drivers_license', 'passport', 'voters_card') THEN RAISE(ABORT, 'invalid identity type') END;
    SELECT CASE WHEN NEW.identity_number_encrypted IS NOT NULL AND (length(NEW.identity_number_encrypted) > 500 OR NEW.identity_number_encrypted NOT LIKE 'v1.%') THEN RAISE(ABORT, 'invalid encrypted identity number') END;
    SELECT CASE WHEN NEW.business_registration_number IS NOT NULL AND length(NEW.business_registration_number) > 80 THEN RAISE(ABORT, 'invalid business registration number') END;
    SELECT CASE WHEN NEW.bank_name IS NOT NULL AND length(trim(NEW.bank_name)) NOT BETWEEN 2 AND 120 THEN RAISE(ABORT, 'invalid bank name') END;
    SELECT CASE WHEN NEW.bank_account_name IS NOT NULL AND length(trim(NEW.bank_account_name)) NOT BETWEEN 2 AND 120 THEN RAISE(ABORT, 'invalid account name') END;
    SELECT CASE WHEN NEW.bank_account_number_encrypted IS NOT NULL AND (length(NEW.bank_account_number_encrypted) > 500 OR NEW.bank_account_number_encrypted NOT LIKE 'v1.%') THEN RAISE(ABORT, 'invalid encrypted account number') END;
    SELECT CASE WHEN NEW.information_confirmed NOT IN (0, 1) THEN RAISE(ABORT, 'invalid confirmation state') END;
  END`,
  `CREATE TRIGGER IF NOT EXISTS validate_vendor_verifications_update BEFORE UPDATE ON vendor_verifications BEGIN
    SELECT CASE WHEN NEW.identity_type IS NOT NULL AND NEW.identity_type NOT IN ('nin', 'drivers_license', 'passport', 'voters_card') THEN RAISE(ABORT, 'invalid identity type') END;
    SELECT CASE WHEN NEW.identity_number_encrypted IS NOT NULL AND (length(NEW.identity_number_encrypted) > 500 OR NEW.identity_number_encrypted NOT LIKE 'v1.%') THEN RAISE(ABORT, 'invalid encrypted identity number') END;
    SELECT CASE WHEN NEW.business_registration_number IS NOT NULL AND length(NEW.business_registration_number) > 80 THEN RAISE(ABORT, 'invalid business registration number') END;
    SELECT CASE WHEN NEW.bank_name IS NOT NULL AND length(trim(NEW.bank_name)) NOT BETWEEN 2 AND 120 THEN RAISE(ABORT, 'invalid bank name') END;
    SELECT CASE WHEN NEW.bank_account_name IS NOT NULL AND length(trim(NEW.bank_account_name)) NOT BETWEEN 2 AND 120 THEN RAISE(ABORT, 'invalid account name') END;
    SELECT CASE WHEN NEW.bank_account_number_encrypted IS NOT NULL AND (length(NEW.bank_account_number_encrypted) > 500 OR NEW.bank_account_number_encrypted NOT LIKE 'v1.%') THEN RAISE(ABORT, 'invalid encrypted account number') END;
    SELECT CASE WHEN NEW.information_confirmed NOT IN (0, 1) THEN RAISE(ABORT, 'invalid confirmation state') END;
  END`,
  `CREATE TRIGGER IF NOT EXISTS validate_vendor_files_insert BEFORE INSERT ON vendor_files BEGIN
    SELECT CASE WHEN NEW.kind NOT IN ('logo', 'cover', 'identity_document', 'business_document') THEN RAISE(ABORT, 'invalid vendor file kind') END;
    SELECT CASE WHEN NEW.media_type NOT IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf') THEN RAISE(ABORT, 'invalid vendor media type') END;
    SELECT CASE WHEN length(trim(NEW.filename)) NOT BETWEEN 1 AND 180 THEN RAISE(ABORT, 'invalid vendor filename') END;
    SELECT CASE WHEN NEW.size < 1 OR NEW.size > 5242880 OR length(NEW.sha256) <> 64 THEN RAISE(ABORT, 'invalid vendor file') END;
  END`,
  `CREATE TRIGGER IF NOT EXISTS validate_vendor_files_update BEFORE UPDATE ON vendor_files BEGIN
    SELECT CASE WHEN NEW.kind NOT IN ('logo', 'cover', 'identity_document', 'business_document') THEN RAISE(ABORT, 'invalid vendor file kind') END;
    SELECT CASE WHEN NEW.media_type NOT IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf') THEN RAISE(ABORT, 'invalid vendor media type') END;
    SELECT CASE WHEN length(trim(NEW.filename)) NOT BETWEEN 1 AND 180 THEN RAISE(ABORT, 'invalid vendor filename') END;
    SELECT CASE WHEN NEW.size < 1 OR NEW.size > 5242880 OR length(NEW.sha256) <> 64 THEN RAISE(ABORT, 'invalid vendor file') END;
  END`,
];

function sqliteColumns(database, table) {
  return new Set(database.prepare(`PRAGMA table_info("${table}")`).all().map((column) => String(column.name)));
}

async function libsqlColumns(client, table) {
  const result = await client.execute(`PRAGMA table_info("${table}")`);
  return new Set(result.rows.map((column) => String(column.name)));
}

function finalizeSqlite(database) {
  database.exec(`
    UPDATE cleaners
    SET verification_status = 'approved', onboarding_step = 'submitted',
        submitted_at = COALESCE(submitted_at, created_at), approved_at = COALESCE(approved_at, created_at)
    WHERE is_approved = 1;
  `);
  for (const trigger of ["validate_cleaners_insert", "validate_cleaners_update", "validate_services_insert", "validate_services_update", "validate_vendor_verifications_insert", "validate_vendor_verifications_update", "validate_vendor_files_insert", "validate_vendor_files_update"]) {
    database.exec(`DROP TRIGGER IF EXISTS ${trigger}`);
  }
  for (const statement of onboardingSchemaStatements) database.exec(statement);
}

async function finalizeLibsql(client) {
  await client.execute(`
    UPDATE cleaners
    SET verification_status = 'approved', onboarding_step = 'submitted',
        submitted_at = COALESCE(submitted_at, created_at), approved_at = COALESCE(approved_at, created_at)
    WHERE is_approved = 1
  `);
  for (const trigger of ["validate_cleaners_insert", "validate_cleaners_update", "validate_services_insert", "validate_services_update", "validate_vendor_verifications_insert", "validate_vendor_verifications_update", "validate_vendor_files_insert", "validate_vendor_files_update"]) {
    await client.execute(`DROP TRIGGER IF EXISTS ${trigger}`);
  }
  for (const statement of onboardingSchemaStatements) await client.execute(statement);
}

export function applyOnboardingSchemaToSqlite(database) {
  const existingCleanerColumns = sqliteColumns(database, "cleaners");
  for (const [name, definition] of cleanerColumns) {
    if (!existingCleanerColumns.has(name)) database.exec(`ALTER TABLE cleaners ADD COLUMN ${name} ${definition}`);
  }
  const existingServiceColumns = sqliteColumns(database, "services");
  for (const [name, definition] of serviceColumns) {
    if (!existingServiceColumns.has(name)) database.exec(`ALTER TABLE services ADD COLUMN ${name} ${definition}`);
  }
  finalizeSqlite(database);
}

export async function applyOnboardingSchemaToLibsql(client) {
  const existingCleanerColumns = await libsqlColumns(client, "cleaners");
  for (const [name, definition] of cleanerColumns) {
    if (!existingCleanerColumns.has(name)) await client.execute(`ALTER TABLE cleaners ADD COLUMN ${name} ${definition}`);
  }
  const existingServiceColumns = await libsqlColumns(client, "services");
  for (const [name, definition] of serviceColumns) {
    if (!existingServiceColumns.has(name)) await client.execute(`ALTER TABLE services ADD COLUMN ${name} ${definition}`);
  }
  await finalizeLibsql(client);
}
