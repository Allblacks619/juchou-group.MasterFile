import "dotenv/config";
import { createPool } from "mysql2/promise";
import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Read-only employee document rescue/audit utility.
 *
 * It NEVER updates/deletes DB rows and NEVER mutates/deletes S3/R2 objects.
 * With --download it only copies discovered objects to a local directory.
 *
 * Examples:
 *   node scripts/rescue-employee-documents.mjs --name "伊藤ルベンス"
 *   node scripts/rescue-employee-documents.mjs --name "伊藤ルベンス" --download --out /tmp/ito-rubens-rescue
 */

function argValue(flag, fallback = undefined) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : fallback;
}

const requestedName = argValue("--name", "伊藤ルベンス");
const requestedId = argValue("--employee-id");
const download = process.argv.includes("--download");
const outDir = path.resolve(argValue("--out", "/tmp/employee-document-rescue"));

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function normalizePersonName(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/[\s　]+/g, "")
    .toUpperCase();
}

function keyFromStoredUrl(storedUrl, bucket) {
  if (!storedUrl) return null;
  try {
    const u = new URL(storedUrl);
    let p = decodeURIComponent(u.pathname).replace(/^\/+/, "");
    if (p.startsWith(`${bucket}/`)) p = p.slice(bucket.length + 1);
    return p || null;
  } catch {
    return null;
  }
}

function safeLocalPath(root, objectKey) {
  const parts = String(objectKey)
    .replace(/^\/+/, "")
    .split("/")
    .filter((part) => part && part !== "." && part !== "..");
  return path.join(root, "objects", ...parts);
}

async function streamToBuffer(body) {
  if (!body) throw new Error("Object body is empty");
  if (typeof body.transformToByteArray === "function") {
    return Buffer.from(await body.transformToByteArray());
  }
  const chunks = [];
  for await (const chunk of body) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

async function listAll(client, bucket, prefix) {
  const objects = [];
  let token;
  do {
    const res = await client.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
      ContinuationToken: token,
    }));
    for (const item of res.Contents || []) {
      if (!item.Key) continue;
      objects.push({
        key: item.Key,
        size: Number(item.Size || 0),
        lastModified: item.LastModified ? item.LastModified.toISOString() : null,
        eTag: item.ETag || null,
      });
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return objects;
}

async function objectExists(client, bucket, key) {
  try {
    const res = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return {
      exists: true,
      size: res.ContentLength == null ? null : Number(res.ContentLength),
      lastModified: res.LastModified ? res.LastModified.toISOString() : null,
      contentType: res.ContentType || null,
      error: null,
    };
  } catch (error) {
    return {
      exists: false,
      size: null,
      lastModified: null,
      contentType: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
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
    let employees;
    if (requestedId) {
      [employees] = await pool.query(
        "SELECT id,userId,nameKanji,nameKana,nameRomaji,photoUrl,stampUrl,companyId,createdAt,updatedAt FROM employees WHERE id = ? LIMIT 5",
        [Number(requestedId)],
      );
    } else {
      const needle = normalizePersonName(requestedName);
      [employees] = await pool.query(
        `SELECT id,userId,nameKanji,nameKana,nameRomaji,photoUrl,stampUrl,companyId,createdAt,updatedAt
           FROM employees
          WHERE UPPER(REPLACE(REPLACE(COALESCE(nameKanji,''),' ',''),'　','')) LIKE ?
             OR UPPER(REPLACE(REPLACE(COALESCE(nameKana,''),' ',''),'　','')) LIKE ?
             OR UPPER(REPLACE(REPLACE(COALESCE(nameRomaji,''),' ',''),'　','')) LIKE ?
             OR nameKanji LIKE '%伊藤%'
             OR UPPER(COALESCE(nameRomaji,'')) LIKE '%RUBENS%'
          ORDER BY updatedAt DESC
          LIMIT 20`,
        [`%${needle}%`, `%${needle}%`, `%${needle}%`],
      );
    }

    if (!Array.isArray(employees) || employees.length === 0) {
      throw new Error(`No employee matched: ${requestedId ? `id=${requestedId}` : requestedName}`);
    }

    const exactNeedle = normalizePersonName(requestedName);
    const exact = employees.filter((e) =>
      [e.nameKanji, e.nameKana, e.nameRomaji].some((v) => normalizePersonName(v) === exactNeedle),
    );
    const targets = requestedId ? employees : exact.length === 1 ? exact : employees;

    const audit = {
      generatedAt: new Date().toISOString(),
      mode: "READ_ONLY",
      requested: { name: requestedName, employeeId: requestedId || null, download },
      warning: "This report does not modify/delete DB rows or S3/R2 objects.",
      matchesFound: employees.map((e) => ({
        id: e.id,
        nameKanji: e.nameKanji,
        nameKana: e.nameKana,
        nameRomaji: e.nameRomaji,
        companyId: e.companyId,
      })),
      employees: [],
    };

    for (const employee of targets) {
      const [documents] = await pool.query(
        `SELECT id,employeeId,documentType,fileName,fileUrl,fileKey,mimeType,fileSize,expiryDate,docStatus,notes,uploadedBy,createdAt,updatedAt
           FROM documents WHERE employeeId = ? ORDER BY createdAt ASC, id ASC`,
        [employee.id],
      );
      const [qualifications] = await pool.query(
        `SELECT id,employeeId,name,obtainedDate,certificateNumber,certificateFileUrl,certificateFileKey,createdAt,updatedAt
           FROM qualifications WHERE employeeId = ? ORDER BY createdAt ASC, id ASC`,
        [employee.id],
      );

      const knownRefs = new Map();
      for (const doc of documents) {
        if (doc.fileKey) knownRefs.set(doc.fileKey, { source: "documents", id: doc.id, label: doc.fileName, type: doc.documentType });
      }
      for (const qual of qualifications) {
        if (qual.certificateFileKey) knownRefs.set(qual.certificateFileKey, { source: "qualifications", id: qual.id, label: qual.name, type: "qualification_cert" });
      }
      const photoKey = keyFromStoredUrl(employee.photoUrl, bucket);
      const stampKey = keyFromStoredUrl(employee.stampUrl, bucket);
      if (photoKey) knownRefs.set(photoKey, { source: "employee.photoUrl", id: employee.id, label: "profile photo", type: "photo" });
      if (stampKey) knownRefs.set(stampKey, { source: "employee.stampUrl", id: employee.id, label: "stamp", type: "stamp" });

      const prefix = `employees/${employee.id}/`;
      let listedObjects = [];
      let listError = null;
      try {
        listedObjects = await listAll(client, bucket, prefix);
      } catch (error) {
        listError = error instanceof Error ? error.message : String(error);
      }

      const listedKeySet = new Set(listedObjects.map((o) => o.key));
      const externalKnownKeys = [...knownRefs.keys()].filter((key) => !listedKeySet.has(key));
      const knownKeyChecks = [];
      for (const key of externalKnownKeys) {
        knownKeyChecks.push({ key, ref: knownRefs.get(key), ...(await objectExists(client, bucket, key)) });
      }

      const orphanObjects = listedObjects
        .filter((object) => !knownRefs.has(object.key))
        .map((object) => ({ ...object, classification: "STORAGE_ORPHAN_OR_OLD_VERSION" }));

      const dbRefsMissingFromStorage = [];
      for (const [key, ref] of knownRefs.entries()) {
        if (listedKeySet.has(key)) continue;
        const check = knownKeyChecks.find((v) => v.key === key);
        if (!check?.exists) dbRefsMissingFromStorage.push({ key, ref, check: check || null });
      }

      const recoverableKeys = new Set(listedObjects.map((o) => o.key));
      for (const item of knownKeyChecks) if (item.exists) recoverableKeys.add(item.key);

      const employeeAudit = {
        employee: {
          id: employee.id,
          userId: employee.userId,
          nameKanji: employee.nameKanji,
          nameKana: employee.nameKana,
          nameRomaji: employee.nameRomaji,
          companyId: employee.companyId,
        },
        prefix,
        documents,
        qualifications,
        currentPhotoKey: photoKey,
        currentStampKey: stampKey,
        storageListError: listError,
        storageObjects: listedObjects,
        storageObjectCount: listedObjects.length,
        orphanObjects,
        orphanObjectCount: orphanObjects.length,
        dbRefsMissingFromStorage,
        dbRefsMissingFromStorageCount: dbRefsMissingFromStorage.length,
        recoverableObjectCount: recoverableKeys.size,
        downloadResults: [],
      };

      if (download) {
        const employeeRoot = path.join(outDir, `employee-${employee.id}`);
        await mkdir(employeeRoot, { recursive: true });
        for (const key of [...recoverableKeys].sort()) {
          const destination = safeLocalPath(employeeRoot, key);
          try {
            const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
            const bytes = await streamToBuffer(res.Body);
            await mkdir(path.dirname(destination), { recursive: true });
            await writeFile(destination, bytes);
            employeeAudit.downloadResults.push({ key, ok: true, bytes: bytes.length, destination });
          } catch (error) {
            employeeAudit.downloadResults.push({
              key,
              ok: false,
              bytes: null,
              destination,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
      }

      audit.employees.push(employeeAudit);
    }

    await mkdir(outDir, { recursive: true });
    await writeFile(path.join(outDir, "audit.json"), `${JSON.stringify(audit, null, 2)}\n`, "utf8");

    const lines = [];
    lines.push("JYUCHOU GROUP - EMPLOYEE DOCUMENT RESCUE AUDIT");
    lines.push(`Generated: ${audit.generatedAt}`);
    lines.push("Mode: READ ONLY (no DB/S3 mutation)");
    lines.push("");
    for (const item of audit.employees) {
      const e = item.employee;
      lines.push(`Employee: ${e.nameKanji || "-"} / ${e.nameRomaji || "-"} (ID ${e.id})`);
      lines.push(`DB documents: ${item.documents.length}`);
      lines.push(`Qualifications: ${item.qualifications.length}`);
      lines.push(`Storage objects under ${item.prefix}: ${item.storageObjectCount}`);
      lines.push(`Orphan/old-version objects: ${item.orphanObjectCount}`);
      lines.push(`DB refs missing from storage: ${item.dbRefsMissingFromStorageCount}`);
      lines.push(`Recoverable objects: ${item.recoverableObjectCount}`);
      if (item.storageListError) lines.push(`WARNING: ListObjects failed: ${item.storageListError}`);
      if (download) {
        const ok = item.downloadResults.filter((r) => r.ok).length;
        const failed = item.downloadResults.length - ok;
        lines.push(`Downloaded copies: ${ok} OK / ${failed} failed`);
      }
      lines.push("");
      if (item.documents.length) {
        lines.push("DB document records:");
        for (const d of item.documents) {
          lines.push(`  - #${d.id} [${d.documentType}] ${d.fileName} key=${d.fileKey}`);
        }
      }
      if (item.orphanObjects.length) {
        lines.push("Storage-only candidates (possible lost/old uploads):");
        for (const o of item.orphanObjects) {
          lines.push(`  - ${o.key} (${o.size} bytes, ${o.lastModified || "date unknown"})`);
        }
      }
      if (item.dbRefsMissingFromStorage.length) {
        lines.push("DB references NOT found in storage:");
        for (const m of item.dbRefsMissingFromStorage) lines.push(`  - ${m.key}`);
      }
      lines.push("");
    }
    await writeFile(path.join(outDir, "audit.txt"), `${lines.join("\n")}\n`, "utf8");

    console.log(lines.join("\n"));
    console.log(`Audit JSON: ${path.join(outDir, "audit.json")}`);
    if (download) console.log(`Rescue copies: ${outDir}`);
  } finally {
    await pool.end().catch(() => {});
  }
}

main().catch((error) => {
  console.error("[rescue-employee-documents] FATAL:", error);
  process.exit(1);
});
