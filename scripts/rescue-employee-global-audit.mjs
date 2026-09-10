import "dotenv/config";
import { createPool } from "mysql2/promise";
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";

/**
 * Read-only global rescue scan for employee documents.
 * NEVER updates/deletes DB rows and NEVER mutates/deletes S3 objects.
 * It correlates the target employee's current DB records with the entire bucket
 * and prints candidate old/mislinked uploads using name, filename and time-window heuristics.
 */

function argValue(flag, fallback = undefined) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : fallback;
}

const requestedName = argValue("--name", "伊藤ルベンス");
const windowHours = Number(argValue("--window-hours", "24"));

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function normalizePersonName(value) {
  return String(value || "").normalize("NFKC").replace(/[\s　]+/g, "").toUpperCase();
}

async function listAll(client, bucket) {
  const objects = [];
  let token;
  do {
    const res = await client.send(new ListObjectsV2Command({
      Bucket: bucket,
      ContinuationToken: token,
    }));
    for (const item of res.Contents || []) {
      if (!item.Key) continue;
      objects.push({
        key: item.Key,
        size: Number(item.Size || 0),
        lastModified: item.LastModified ? item.LastModified.toISOString() : null,
      });
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return objects;
}

function objectEmployeeId(key) {
  const m = /^employees\/(\d+)\//.exec(String(key));
  return m ? Number(m[1]) : null;
}

function basename(key) {
  const parts = String(key).split("/");
  return parts[parts.length - 1] || "";
}

function stripRandomPrefix(name) {
  // app storage keys are usually <nanoid>-<original filename>
  const i = String(name).indexOf("-");
  return i > 0 ? String(name).slice(i + 1) : String(name);
}

async function main() {
  const databaseUrl = requiredEnv("DATABASE_URL");
  const endpoint = requiredEnv("S3_ENDPOINT");
  const bucket = requiredEnv("S3_BUCKET");
  const accessKeyId = requiredEnv("S3_ACCESS_KEY_ID");
  const secretAccessKey = requiredEnv("S3_SECRET_ACCESS_KEY");

  const pool = createPool(databaseUrl);
  const client = new S3Client({
    endpoint,
    region: process.env.S3_REGION || "auto",
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
  });

  try {
    const needle = normalizePersonName(requestedName);
    const [employeeRows] = await pool.query(
      `SELECT id,userId,nameKanji,nameKana,nameRomaji,createdAt,updatedAt
         FROM employees
        WHERE UPPER(REPLACE(REPLACE(COALESCE(nameKanji,''),' ',''),'　','')) LIKE ?
           OR UPPER(REPLACE(REPLACE(COALESCE(nameKana,''),' ',''),'　','')) LIKE ?
           OR UPPER(REPLACE(REPLACE(COALESCE(nameRomaji,''),' ',''),'　','')) LIKE ?
           OR nameKanji LIKE '%伊藤%'
           OR UPPER(COALESCE(nameRomaji,'')) LIKE '%RUBENS%'
        ORDER BY updatedAt DESC`,
      [`%${needle}%`, `%${needle}%`, `%${needle}%`],
    );

    if (!Array.isArray(employeeRows) || employeeRows.length === 0) {
      throw new Error(`No employee matched: ${requestedName}`);
    }

    const exact = employeeRows.filter((e) =>
      [e.nameKanji, e.nameKana, e.nameRomaji].some((v) => normalizePersonName(v) === needle),
    );
    const targets = exact.length ? exact : employeeRows;
    const targetIds = new Set(targets.map((e) => Number(e.id)));

    const [targetDocs] = await pool.query(
      `SELECT id,employeeId,documentType,fileName,fileKey,createdAt,updatedAt
         FROM documents
        WHERE employeeId IN (${targets.map(() => "?").join(",")})
        ORDER BY createdAt ASC, id ASC`,
      targets.map((e) => Number(e.id)),
    );

    const [targetQuals] = await pool.query(
      `SELECT id,employeeId,name,certificateFileKey,createdAt,updatedAt
         FROM qualifications
        WHERE employeeId IN (${targets.map(() => "?").join(",")})
        ORDER BY createdAt ASC, id ASC`,
      targets.map((e) => Number(e.id)),
    );

    const allObjects = await listAll(client, bucket);

    const knownKeys = new Set();
    const originalNames = new Set();
    const anchorTimes = [];
    for (const d of targetDocs) {
      if (d.fileKey) knownKeys.add(String(d.fileKey));
      if (d.fileName) originalNames.add(String(d.fileName));
      if (d.createdAt) anchorTimes.push(new Date(d.createdAt).getTime());
    }
    for (const q of targetQuals) {
      if (q.certificateFileKey) knownKeys.add(String(q.certificateFileKey));
      if (q.createdAt) anchorTimes.push(new Date(q.createdAt).getTime());
    }

    const minAnchor = anchorTimes.length ? Math.min(...anchorTimes) : null;
    const maxAnchor = anchorTimes.length ? Math.max(...anchorTimes) : null;
    const padMs = Math.max(1, windowHours) * 60 * 60 * 1000;

    const targetPrefixObjects = allObjects.filter((o) => targetIds.has(objectEmployeeId(o.key)));
    const exactFilenameMatches = allObjects.filter((o) => originalNames.has(stripRandomPrefix(basename(o.key))));
    const sSeriesObjects = allObjects.filter((o) => /^.*S__\d+\.(?:jpg|jpeg|png|pdf)$/i.test(basename(o.key)));
    const timeWindowObjects = minAnchor != null && maxAnchor != null
      ? allObjects.filter((o) => {
          if (!o.lastModified) return false;
          const t = new Date(o.lastModified).getTime();
          return Number.isFinite(t) && t >= minAnchor - padMs && t <= maxAnchor + padMs;
        })
      : [];

    // Candidates = outside current target prefixes but matching current filenames,
    // or S__ series objects in the same upload time window.
    const candidateMap = new Map();
    for (const o of exactFilenameMatches) {
      if (!targetIds.has(objectEmployeeId(o.key))) candidateMap.set(o.key, { ...o, reason: "SAME_ORIGINAL_FILENAME_OUTSIDE_CURRENT_EMPLOYEE" });
    }
    for (const o of timeWindowObjects) {
      if (targetIds.has(objectEmployeeId(o.key))) continue;
      if (/S__\d+\.(?:jpg|jpeg|png|pdf)$/i.test(basename(o.key))) {
        candidateMap.set(o.key, { ...o, reason: candidateMap.get(o.key)?.reason || "S__FILE_IN_SAME_UPLOAD_TIME_WINDOW" });
      }
    }

    const candidates = [...candidateMap.values()].sort((a, b) => String(a.lastModified).localeCompare(String(b.lastModified)));

    const group = new Map();
    for (const o of candidates) {
      const id = objectEmployeeId(o.key);
      const k = id == null ? "non_employee_prefix" : String(id);
      if (!group.has(k)) group.set(k, []);
      group.get(k).push(o);
    }

    console.log("JYUCHOU GROUP — GLOBAL EMPLOYEE DOCUMENT RESCUE SCAN");
    console.log(`Mode: READ ONLY (no DB/S3 mutation)`);
    console.log(`Target: ${requestedName}`);
    console.log(`Matched employee IDs: ${targets.map((e) => e.id).join(", ")}`);
    console.log(`Bucket objects scanned: ${allObjects.length}`);
    console.log(`Current target-prefix objects: ${targetPrefixObjects.length}`);
    console.log(`Current DB documents: ${targetDocs.length}`);
    console.log(`Current qualifications: ${targetQuals.length}`);
    console.log(`Global S__* objects: ${sSeriesObjects.length}`);
    if (minAnchor != null && maxAnchor != null) {
      console.log(`Anchor DB upload range: ${new Date(minAnchor).toISOString()} .. ${new Date(maxAnchor).toISOString()}`);
      console.log(`Candidate time window: ±${windowHours}h`);
    }
    console.log(`Outside-prefix rescue candidates: ${candidates.length}`);

    console.log("\nCurrent DB document records:");
    for (const d of targetDocs) {
      console.log(`- #${d.id} employee=${d.employeeId} type=${d.documentType} file=${d.fileName} created=${d.createdAt ? new Date(d.createdAt).toISOString() : "-"} key=${d.fileKey || "-"}`);
    }

    console.log("\nOutside-prefix candidate groups:");
    if (group.size === 0) console.log("- NONE FOUND by current heuristics");
    for (const [id, rows] of group.entries()) {
      console.log(`\n[employee-prefix ${id}] ${rows.length} candidate(s)`);
      for (const o of rows) console.log(`- ${o.lastModified || "-"} ${o.size}B ${o.reason} :: ${o.key}`);
    }

    console.log("\nNOTE: A candidate is not automatically owned by the target employee. No files were changed or moved.");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("GLOBAL RESCUE SCAN FAILED:", error instanceof Error ? error.stack || error.message : error);
  process.exitCode = 1;
});
