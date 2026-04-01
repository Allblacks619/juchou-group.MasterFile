/**
 * Create employee record for admin user (Mitsuro Oki)
 * and link it to the user account
 */
import mysql from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

async function main() {
  const conn = await mysql.createConnection(DATABASE_URL);

  // Find admin user
  const [rows] = await conn.execute(
    `SELECT id, openId, loginId, employeeId FROM users WHERE loginId = 'Mitsuro Oki' LIMIT 1`
  );

  if (!rows.length) {
    console.error("Admin user not found");
    await conn.end();
    process.exit(1);
  }

  const admin = rows[0];
  console.log("Found admin user:", admin);

  if (admin.employeeId) {
    console.log("Admin already has employee record:", admin.employee_id);
    await conn.end();
    process.exit(0);
  }

  // Create employee record
  const [result] = await conn.execute(
    `INSERT INTO employees (nameKanji, nameRomaji, userId, nationality) VALUES (?, ?, ?, ?)`,
    ["大木 光郎", "Mitsuro Oki", admin.id, "ブラジル"]
  );

  const employeeId = result.insertId;
  console.log("Created employee record:", employeeId);

  // Link to user
  await conn.execute(
    `UPDATE users SET employeeId = ? WHERE id = ?`,
    [employeeId, admin.id]
  );

  console.log("Linked employee to admin user");
  console.log("Done!");
  await conn.end();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
