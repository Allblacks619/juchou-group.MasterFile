import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

function getS3Config() {
  const endpoint = process.env.S3_ENDPOINT;
  const bucket = process.env.S3_BUCKET;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;

  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "Storage env vars required: S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY"
    );
  }
  return { endpoint, bucket, accessKeyId, secretAccessKey };
}

function getS3Client() {
  const { endpoint, accessKeyId, secretAccessKey } = getS3Config();
  return new S3Client({
    endpoint,
    region: process.env.S3_REGION || "auto",
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
  });
}

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

function getTtl(): number {
  return parseInt(process.env.S3_SIGNED_URL_TTL_SEC || "3600", 10);
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  const { bucket } = getS3Config();
  const key = normalizeKey(relKey);
  const client = getS3Client();
  const body = typeof data === "string" ? Buffer.from(data) : data;

  await client.send(
    new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType })
  );

  const url = await getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn: getTtl() }
  );
  return { key, url };
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const { bucket } = getS3Config();
  const key = normalizeKey(relKey);
  const client = getS3Client();

  const url = await getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn: getTtl() }
  );
  return { key, url };
}

/** オブジェクトの中身をバイト列で取得する（PDF合体などサーバー内処理用）。 */
export async function storageGetBytes(relKey: string): Promise<Buffer> {
  const { bucket } = getS3Config();
  const key = normalizeKey(relKey);
  const client = getS3Client();
  const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const bytes = await result.Body?.transformToByteArray();
  if (!bytes) throw new Error(`Storage object empty: ${key}`);
  return Buffer.from(bytes);
}
