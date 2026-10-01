import { createHash } from "node:crypto";
import { hash } from "bcryptjs";
import { createClient } from "@libsql/client";

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;
const email = process.env.USER_EMAIL?.trim().toLowerCase();
const password = process.env.NEW_PASSWORD;
const cost = Number(process.env.BCRYPT_COST || 12);

if (!url || !authToken) throw new Error("TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are required.");
if (!email || !email.includes("@")) throw new Error("USER_EMAIL must be a valid account email.");
if (!password || password.length < 12 || password.length > 128) {
  throw new Error("NEW_PASSWORD must contain between 12 and 128 characters.");
}
if (!Number.isInteger(cost) || cost < 12 || cost > 14) throw new Error("BCRYPT_COST must be between 12 and 14.");

const client = createClient({ url, authToken });
try {
  const user = await client.execute({ sql: "SELECT id FROM users WHERE lower(email) = ?", args: [email] });
  if (!user.rows.length) throw new Error("The requested user does not exist.");
  const userId = Number(user.rows[0].id);
  const timestamp = new Date().toISOString().replace("T", " ").replace("Z", "");
  const passwordHash = await hash(password, cost);
  const auditSalt = process.env.AUDIT_LOG_SALT || "maintenance-command";
  const ipHash = createHash("sha256").update(`maintenance:${auditSalt}`).digest("hex");

  await client.batch([
    {
      sql: "UPDATE users SET password = ?, updated_at = ? WHERE id = ?",
      args: [passwordHash, timestamp, userId],
    },
    { sql: "DELETE FROM js_sessions WHERE user_id = ?", args: [userId] },
    {
      sql: `INSERT INTO audit_logs
        (actor_user_id, action, target_type, target_id, outcome, request_id, ip_hash, metadata, created_at)
       VALUES (?, 'maintenance.password_reset', 'user', ?, 'succeeded', ?, ?, ?, ?)`,
      args: [
        userId,
        String(userId),
        `cli-${Date.now()}`,
        ipHash,
        JSON.stringify({ sessionsRevoked: true }),
        timestamp,
      ],
    },
  ], "write");
  console.log(`Password updated and sessions revoked for ${email}.`);
} finally {
  client.close();
}
