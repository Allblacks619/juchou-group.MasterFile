import "dotenv/config";
import { createPool } from "mysql2/promise";
import bcrypt from "bcryptjs";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");

  const loginId = process.env.OWNER_LOGIN_ID || process.argv[2];
  const password = process.env.OWNER_PASSWORD || process.argv[3];
  const openId = process.env.OWNER_OPEN_ID || `owner_${loginId}`;
  const name = process.env.OWNER_NAME || loginId;

  if (!loginId || !password) {
    throw new Error(
      "Set OWNER_LOGIN_ID and OWNER_PASSWORD env vars (or pass loginId password as CLI args)"
    );
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const now = new Date();
  const pool = createPool(url);

  try {
    const [rows] = await pool.execute(
      "SELECT id FROM users WHERE openId = ? OR loginId = ? LIMIT 1",
      [openId, loginId]
    );

    if (rows.length > 0) {
      await pool.execute(
        `UPDATE users SET
          name = ?, loginId = ?, passwordHash = ?,
          role = 'admin', appRole = 'super_admin',
          mustChangePassword = 1, loginMethod = 'password',
          updatedAt = ?
         WHERE openId = ? OR loginId = ?`,
        [name, loginId, passwordHash, now, openId, loginId]
      );
      console.log(`[seed-owner] Updated existing user: ${loginId}`);
    } else {
      await pool.execute(
        `INSERT INTO users
          (openId, name, loginId, passwordHash, role, appRole,
           mustChangePassword, loginMethod, createdAt, updatedAt, lastSignedIn)
         VALUES (?, ?, ?, ?, 'admin', 'super_admin', 1, 'password', ?, ?, ?)`,
        [openId, name, loginId, passwordHash, now, now, now]
      );
      console.log(`[seed-owner] Created owner user: ${loginId}`);
    }
  } finally {
    await pool.end();
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("[seed-owner] Fatal:", err);
  process.exit(1);
});
