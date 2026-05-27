/**
 * Seed script: Create the initial admin account
 * Admin login: ID "Mitsuro Oki" / Password "Paulodetarso7663"
 * 
 * Usage: node server/seed-admin.mjs
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import mysql from "mysql2/promise";

const ADMIN_LOGIN_ID = "Mitsuro Oki";
const ADMIN_PASSWORD = "Paulodetarso7663";
const ADMIN_OPEN_ID = "custom_admin_mitsuro_oki";
const BCRYPT_ROUNDS = 12;

async function seedAdmin() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }

  console.log("[Seed] Connecting to database...");
  const connection = await mysql.createConnection(databaseUrl);

  try {
    // Check if admin already exists
    const [existing] = await connection.execute(
      "SELECT id, loginId FROM users WHERE loginId = ?",
      [ADMIN_LOGIN_ID]
    );

    if (Array.isArray(existing) && existing.length > 0) {
      console.log(`[Seed] Admin user "${ADMIN_LOGIN_ID}" already exists (id: ${existing[0].id}). Updating password...`);
      
      const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, BCRYPT_ROUNDS);
      await connection.execute(
        "UPDATE users SET passwordHash = ?, role = 'admin', appRole = 'admin', mustChangePassword = false WHERE loginId = ?",
        [passwordHash, ADMIN_LOGIN_ID]
      );
      console.log("[Seed] Admin password updated successfully.");
    } else {
      console.log(`[Seed] Creating admin user "${ADMIN_LOGIN_ID}"...`);
      
      const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, BCRYPT_ROUNDS);
      await connection.execute(
        `INSERT INTO users (openId, name, loginId, passwordHash, role, appRole, mustChangePassword, lastSignedIn, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, 'admin', 'admin', false, NOW(), NOW(), NOW())`,
        [ADMIN_OPEN_ID, ADMIN_LOGIN_ID, ADMIN_LOGIN_ID, passwordHash]
      );
      console.log("[Seed] Admin user created successfully.");
    }

    // Verify
    const [verify] = await connection.execute(
      "SELECT id, openId, name, loginId, role, appRole, mustChangePassword FROM users WHERE loginId = ?",
      [ADMIN_LOGIN_ID]
    );
    if (Array.isArray(verify) && verify.length > 0) {
      console.log("[Seed] Verification:", verify[0]);
    }
  } catch (error) {
    console.error("[Seed] Error:", error);
    process.exit(1);
  } finally {
    await connection.end();
  }

  console.log("[Seed] Done!");
}

seedAdmin();
