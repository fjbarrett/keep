// Pluggable public-file storage so the app isn't tied to one host.
//
// Picks a backend from env at call time:
//   - S3-compatible (DO Spaces, Cloudflare R2, AWS S3) when S3_BUCKET is set
//   - Vercel Blob when BLOB_READ_WRITE_TOKEN is set
// This lets the same code run on Vercel today and a DigitalOcean droplet
// (Spaces) after the move, with no code change — only env.

export type PutResult = { url: string };

const s3Bucket = process.env.S3_BUCKET;
const blobToken = process.env.BLOB_READ_WRITE_TOKEN;

/** True when at least one storage backend is configured. */
export function storageConfigured(): boolean {
  return Boolean(s3Bucket || blobToken);
}

export async function putPublicFile(
  path: string,
  body: Uint8Array,
  contentType: string,
): Promise<PutResult> {
  if (s3Bucket) return putToS3(path, body, contentType);
  if (blobToken) return putToBlob(path, body, contentType);
  throw new Error("No object storage configured");
}

async function putToS3(
  path: string,
  body: Uint8Array,
  contentType: string,
): Promise<PutResult> {
  const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
  const client = new S3Client({
    region: process.env.S3_REGION ?? "us-east-1",
    endpoint: process.env.S3_ENDPOINT, // e.g. https://sfo3.digitaloceanspaces.com
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
    },
  });
  await client.send(
    new PutObjectCommand({
      Bucket: s3Bucket,
      Key: path,
      Body: body,
      ContentType: contentType,
      ACL: "public-read",
    }),
  );
  // S3_PUBLIC_BASE_URL is the CDN/origin the bucket is served from; fall back
  // to the virtual-hosted endpoint.
  const base =
    process.env.S3_PUBLIC_BASE_URL ??
    `${process.env.S3_ENDPOINT}/${s3Bucket}`;
  return { url: `${base.replace(/\/$/, "")}/${path}` };
}

async function putToBlob(
  path: string,
  body: Uint8Array,
  contentType: string,
): Promise<PutResult> {
  const { put } = await import("@vercel/blob");
  const blob = await put(path, Buffer.from(body), { access: "public", contentType });
  return { url: blob.url };
}
