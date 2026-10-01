import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { hashSync } from "bcryptjs";
import { applySecuritySchemaToSqlite } from "./security-schema.mjs";

const databasePath = process.env.DATABASE_PATH || path.join(process.cwd(), "data", "laundrylink.sqlite");
mkdirSync(path.dirname(databasePath), { recursive: true });

const db = new DatabaseSync(databasePath);
db.exec(`
  PRAGMA foreign_keys = ON;
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    email_verified_at TEXT,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'customer',
    phone TEXT,
    address TEXT,
    remember_token TEXT,
    created_at TEXT,
    updated_at TEXT
  );

  CREATE TABLE IF NOT EXISTS cleaners (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    business_name TEXT NOT NULL,
    description TEXT,
    address TEXT NOT NULL,
    city TEXT NOT NULL,
    phone TEXT NOT NULL,
    rating NUMERIC NOT NULL DEFAULT 0,
    turnaround_time TEXT,
    opening_hours TEXT,
    is_available INTEGER NOT NULL DEFAULT 1,
    is_approved INTEGER NOT NULL DEFAULT 0,
    created_at TEXT,
    updated_at TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS services (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cleaner_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    price NUMERIC NOT NULL,
    unit TEXT NOT NULL DEFAULT 'per_item',
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT,
    updated_at TEXT,
    FOREIGN KEY (cleaner_id) REFERENCES cleaners(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS addresses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    label TEXT,
    address TEXT NOT NULL,
    city TEXT NOT NULL,
    phone TEXT,
    is_default INTEGER NOT NULL DEFAULT 0,
    delivery_notes TEXT,
    created_at TEXT,
    updated_at TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER,
    cleaner_id INTEGER NOT NULL,
    pickup_address TEXT,
    delivery_address TEXT,
    pickup_date TEXT,
    pickup_time_window TEXT,
    delivery_date TEXT,
    delivery_time_window TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    subtotal NUMERIC NOT NULL DEFAULT 0,
    delivery_fee NUMERIC NOT NULL DEFAULT 0,
    platform_fee NUMERIC NOT NULL DEFAULT 0,
    total NUMERIC NOT NULL DEFAULT 0,
    payment_status TEXT NOT NULL DEFAULT 'unpaid',
    paid_at TEXT,
    pickup_notes TEXT,
    delivery_notes TEXT,
    notes TEXT,
    created_at TEXT,
    updated_at TEXT,
    FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (cleaner_id) REFERENCES cleaners(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    service_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    price NUMERIC NOT NULL,
    created_at TEXT,
    updated_at TEXT,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    customer_id INTEGER,
    amount NUMERIC NOT NULL,
    provider TEXT NOT NULL DEFAULT 'manual',
    reference TEXT UNIQUE,
    authorization_url TEXT,
    access_code TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    paid_at TEXT,
    metadata TEXT,
    created_at TEXT,
    updated_at TEXT,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL UNIQUE,
    customer_id INTEGER,
    cleaner_id INTEGER NOT NULL,
    rating INTEGER NOT NULL,
    comment TEXT,
    created_at TEXT,
    updated_at TEXT,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (cleaner_id) REFERENCES cleaners(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT,
    read_at TEXT,
    data TEXT,
    created_at TEXT,
    updated_at TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS order_activities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    user_id INTEGER,
    action TEXT NOT NULL,
    description TEXT NOT NULL,
    metadata TEXT,
    created_at TEXT,
    updated_at TEXT,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS js_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token_hash TEXT NOT NULL UNIQUE,
    user_id INTEGER NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS js_sessions_user_id_index ON js_sessions(user_id);
  CREATE INDEX IF NOT EXISTS js_sessions_expires_at_index ON js_sessions(expires_at);
  CREATE INDEX IF NOT EXISTS notifications_user_read_index ON notifications(user_id, read_at);
  CREATE INDEX IF NOT EXISTS activities_order_created_index ON order_activities(order_id, created_at);
`);
applySecuritySchemaToSqlite(db);

const existingUsers = db.prepare("SELECT COUNT(1) AS count FROM users").get().count;
if (existingUsers > 0) {
  console.log(`LaundryLink database ready at ${databasePath}`);
  process.exit(0);
}

const timestamp = new Date().toISOString();
const password = hashSync(process.env.DEMO_PASSWORD || "development-password", 12);
const insertUser = db.prepare(`
  INSERT INTO users (name, email, password, role, phone, address, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

db.exec("BEGIN IMMEDIATE");
try {
  const adminId = Number(insertUser.run("Ada Admin", "admin@example.com", password, "admin", "08010000001", "12 Marina Road, Lagos", timestamp, timestamp).lastInsertRowid);
  const customerId = Number(insertUser.run("Tola Martins", "customer@example.com", password, "customer", "08020000001", "14 Admiralty Way, Lekki", timestamp, timestamp).lastInsertRowid);
  const cleanerUserId = Number(insertUser.run("Bisi Fresh", "cleaner@example.com", password, "cleaner", "08030000001", "8 Admiralty Road, Lagos", timestamp, timestamp).lastInsertRowid);

  db.prepare(`INSERT INTO addresses (user_id, label, address, city, phone, is_default, delivery_notes, created_at, updated_at) VALUES (?, 'Home', ?, 'Lagos', ?, 1, ?, ?, ?)`)
    .run(customerId, "14 Admiralty Way, Lekki", "08020000001", "Call at the estate gate before arrival.", timestamp, timestamp);

  const cleanerId = Number(db.prepare(`
    INSERT INTO cleaners (user_id, business_name, description, address, city, phone, rating, turnaround_time, opening_hours, is_available, is_approved, created_at, updated_at)
    VALUES (?, 'FreshFold Laundry', 'Neighborhood wash, fold, and dry-cleaning with careful packaging.', '8 Admiralty Road', 'Lagos', '08030000001', 4.8, '24-48 hours', 'Mon-Sat, 8am-6pm', 1, 1, ?, ?)
  `).run(cleanerUserId, timestamp, timestamp).lastInsertRowid);

  const insertService = db.prepare(`INSERT INTO services (cleaner_id, name, description, price, unit, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)`);
  insertService.run(cleanerId, "Shirt Laundry", "Washed, pressed, and folded shirts.", 1200, "per_item", timestamp, timestamp);
  insertService.run(cleanerId, "Suit Dry Cleaning", "Two-piece suit care with finishing.", 6500, "per_item", timestamp, timestamp);
  insertService.run(cleanerId, "Wash & Fold", "Everyday clothing by weight.", 1800, "per_kg", timestamp, timestamp);
  insertService.run(cleanerId, "Bedding Set", "Sheets, pillowcases, and duvet cover.", 5000, "flat_rate", timestamp, timestamp);

  db.prepare(`INSERT INTO notifications (user_id, title, message, type, data, created_at, updated_at) VALUES (?, 'Welcome to LaundryLink', 'Your demo administrator account is ready.', 'general', ?, ?, ?)`)
    .run(adminId, JSON.stringify({ demo: true }), timestamp, timestamp);

  db.exec("COMMIT");
  console.log(`Created LaundryLink demo database at ${databasePath}`);
} catch (error) {
  db.exec("ROLLBACK");
  throw error;
}
