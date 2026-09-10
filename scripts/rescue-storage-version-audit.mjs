import "dotenv/config";
import { S3Client, GetBucketVersioningCommand, ListObjectVersionsCommand } from "@aws-sdk/client-s3";

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function main() {
  const endpoint = requiredEnv("S3_ENDPOINT");
  const bucket = requiredEnv("S3_BUCKET");
  const accessKeyId = requiredEnv("S3_ACCESS_KEY_ID");
  const secretAccessKey = requiredEnv("S3_SECRET_ACCESS_KEY");
  const prefix = process.argv.includes("--prefix") ? process.argv[process.argv.indexOf("--prefix") + 1] : "employees/";

  const client = new S3Client({
    endpoint,
    region: process.env.S3_REGION || "auto",
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
  });

  console.log("JYUCHOU GROUP — STORAGE VERSION HISTORY AUDIT");
  console.log("Mode: READ ONLY (no DB/S3 mutation)");
  console.log(`Prefix: ${prefix}`);

  try {
    const versioning = await client.send(new GetBucketVersioningCommand({ Bucket: bucket }));
    console.log(`Bucket versioning status: ${versioning.Status || "UNSET/DISABLED"}`);
    console.log(`MFA delete: ${versioning.MFADelete || "UNSET"}`);
  } catch (err) {
    console.log(`Bucket versioning status: CHECK_FAILED (${err?.name || "Error"}: ${err?.message || err})`);
  }

  let keyMarker;
  let versionIdMarker;
  let totalVersions = 0;
  let totalDeleteMarkers = 0;
  let oldVersions = 0;
  const rows = [];

  do {
    const res = await client.send(new ListObjectVersionsCommand({
      Bucket: bucket,
      Prefix: prefix,
      KeyMarker: keyMarker,
      VersionIdMarker: versionIdMarker,
    }));

    for (const v of res.Versions || []) {
      totalVersions += 1;
      if (!v.IsLatest) oldVersions += 1;
      rows.push({
        kind: "VERSION",
        key: v.Key || "",
        versionId: v.VersionId || "null",
        latest: !!v.IsLatest,
        size: Number(v.Size || 0),
        lastModified: v.LastModified ? v.LastModified.toISOString() : "-",
      });
    }
    for (const d of res.DeleteMarkers || []) {
      totalDeleteMarkers += 1;
      rows.push({
        kind: "DELETE_MARKER",
        key: d.Key || "",
        versionId: d.VersionId || "null",
        latest: !!d.IsLatest,
        size: 0,
        lastModified: d.LastModified ? d.LastModified.toISOString() : "-",
      });
    }

    keyMarker = res.IsTruncated ? res.NextKeyMarker : undefined;
    versionIdMarker = res.IsTruncated ? res.NextVersionIdMarker : undefined;
  } while (keyMarker);

  rows.sort((a, b) => a.key.localeCompare(b.key) || a.lastModified.localeCompare(b.lastModified));

  console.log(`Version records: ${totalVersions}`);
  console.log(`Old/non-latest versions: ${oldVersions}`);
  console.log(`Delete markers: ${totalDeleteMarkers}`);

  console.log("\nVersion history rows:");
  if (rows.length === 0) {
    console.log("- NONE");
  } else {
    for (const r of rows) {
      console.log(`- ${r.kind} latest=${r.latest} ${r.lastModified} ${r.size}B version=${r.versionId} :: ${r.key}`);
    }
  }

  console.log("\nNOTE: This command only reads bucket version metadata. No versions were restored, deleted, copied, or modified.");
}

main().catch((error) => {
  console.error("VERSION AUDIT FAILED:", error instanceof Error ? error.stack || error.message : error);
  process.exitCode = 1;
});
