import "dotenv/config";
import { createPool } from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_FOLDER = path.resolve(__dirname, "..", "drizzle");

const MAX_RETRIES = 30;
const RETRY_DELAY_MS = 2000;

async function waitForDB(url) {
  for (let i = 1; i <= MAX_RETRIES; i++) {
    let pool;
    try {
      pool = createPool(url);
      const conn = await pool.getConnection();
      conn.release();
      await pool.end();
      console.log("[migrate] DB is ready.");
      return;
    } catch (err) {
      if (pool) await pool.end().catch(() => {});
      console.log(`[migrate] DB not ready (attempt ${i}/${MAX_RETRIES}): ${err.message}`);
      if (i === MAX_RETRIES) throw new Error("DB never became ready after 30 attempts");
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    }
  }
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");

  await waitForDB(url);

  const pool = createPool(url);
  const db = drizzle(pool);

  console.log("[migrate] Running migrations from", MIGRATIONS_FOLDER);
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  console.log("[migrate] Migrations complete.");

  await pool.end();
  process.exit(0);
}

main().catch((err) => {
  console.error("[migrate] Fatal:", err);
  process.exit(1);
});
