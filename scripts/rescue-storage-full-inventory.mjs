import "dotenv/config";
import { createPool } from "mysql2/promise";
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";

/**
 * READ-ONLY full storage inventory for employee-file rescue.
 * Lists every object in the configured S3/MinIO bucket and resolves employee prefixes
 * to current employee names when possible. NEVER mutates DB or storage.
 */
function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function listAll(client, bucket) {
  const out = [];
  let token;
  do {
    const res = await client.send(new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token }));
    for (const item of res.Contents || []) {
      if (!item.Key) continue;
      out.push({
        key: item.Key,
        size: Number(item.Size || 0),
        lastModified: item.LastModified ? item.LastModified.toISOString() : null,
      });
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return out.sort((a, b) => String(a.key).localeCompare(String(b.key), "ja"));
}

function employeeIdFromKey(key) {
  const m = /^employees\/(\d+)\//.exec(String(key));
  return m ? Number(m[1]) : null;
}

async function main() {
  const pool = createPool(requiredEnv("DATABASE_URL"));
  const client = new S3Client({
    endpoint: requiredEnv("S3_ENDPOINT"),
    region: process.env.S3_REGION || "auto",
    credentials: {
      accessKeyId: requiredEnv("S3_ACCESS_KEY_ID"),
      secretAccessKey: requiredEnv("S3_SECRET_ACCESS_KEY"),
    },
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
  });
  const bucket = requiredEnv("S3_BUCKET");

  try {
    const [employees] = await pool.query(`SELECT id,nameKanji,nameKana,nameRomaji FROM employees ORDER BY id`);
    const nameById = new Map((employees || []).map((e) => [Number(e.id), e.nameKanji || e.nameRomaji || e.nameKana || "(no name)"]));
    const objects = await listAll(client, bucket);

    console.log("JYUCHOU GROUP — FULL STORAGE INVENTORY");
    console.log("Mode: READ ONLY (no DB/S3 mutation)");
    console.log(`Bucket objects: ${objects.length}`);
    console.log("");

    const groups = new Map();
    for (const o of objects) {
      const employeeId = employeeIdFromKey(o.key);
      const groupKey = employeeId == null ? "NON_EMPLOYEE_PREFIX" : `EMPLOYEE ${employeeId}`;
      if (!groups.has(groupKey)) groups.set(groupKey, []);
      groups.get(groupKey).push({ ...o, employeeId });
    }

    for (const [groupKey, rows] of groups) {
      const employeeId = rows[0]?.employeeId;
      const employeeName = employeeId == null ? "" : ` / ${nameById.get(employeeId) || "UNKNOWN/DELETED EMPLOYEE"}`;
      console.log(`[${groupKey}${employeeName}] ${rows.length} object(s)`);
      for (const o of rows) {
        console.log(`- ${o.lastModified || "-"} | ${o.size}B | ${o.key}`);
      }
      console.log("");
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("FULL STORAGE INVENTORY FAILED:", error instanceof Error ? error.stack || error.message : error);
  process.exitCode = 1;
});
