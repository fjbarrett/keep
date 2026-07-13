// Pluggable private-file storage so the app isn't tied to one host.
//
// Picks a backend from env at call time:
//   - S3-compatible (DO Spaces, Cloudflare R2, AWS S3) when S3_BUCKET is set
//   - Vercel Blob when BLOB_READ_WRITE_TOKEN is set
// This lets the same code run on Vercel today and a DigitalOcean droplet
// (Spaces) after the move, with no code change — only env.

export type StoredFile = {
  body: BodyInit;
  contentType: string;
};

const s3Bucket = process.env.S3_BUCKET;
const blobToken = process.env.BLOB_READ_WRITE_TOKEN;

/** True when at least one storage backend is configured. */
export function storageConfigured(): boolean {
  return Boolean(s3Bucket || blobToken);
}

export async function putPrivateFile(
  path: string,
  body: Uint8Array,
  contentType: string,
): Promise<void> {
  if (s3Bucket) return putToS3(path, body, contentType);
  if (blobToken) return putToBlob(path, body, contentType);
  throw new Error("No object storage configured");
}

async function putToS3(
  path: string,
  body: Uint8Array,
  contentType: string,
): Promise<void> {
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
    }),
  );
}

async function putToBlob(
  path: string,
  body: Uint8Array,
  contentType: string,
): Promise<void> {
  const { put } = await import("@vercel/blob");
  await put(path, Buffer.from(body), {
    access: "private",
    contentType,
    token: blobToken,
  });
}

export async function getPrivateFile(path: string): Promise<StoredFile | null> {
  if (s3Bucket) {
    const { S3Client, GetObjectCommand } = await import("@aws-sdk/client-s3");
    const client = new S3Client({
      region: process.env.S3_REGION ?? "us-east-1",
      endpoint: process.env.S3_ENDPOINT,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
      },
    });
    try {
      const result = await client.send(new GetObjectCommand({ Bucket: s3Bucket, Key: path }));
      if (!result.Body) return null;
      const bytes = await result.Body.transformToByteArray();
      return {
        body: bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ) as ArrayBuffer,
        contentType: result.ContentType ?? "application/octet-stream",
      };
    } catch (err) {
      const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      if (status === 403 || status === 404) return null;
      throw err;
    }
  }
  if (blobToken) {
    const { get } = await import("@vercel/blob");
    const result = await get(path, { access: "private", token: blobToken });
    if (!result || result.statusCode === 304 || !result.stream) return null;
    return { body: result.stream, contentType: result.blob.contentType };
  }
  throw new Error("No object storage configured");
}

export async function deletePrivateFile(path: string): Promise<void> {
  if (s3Bucket) {
    const { S3Client, DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    const client = new S3Client({
      region: process.env.S3_REGION ?? "us-east-1",
      endpoint: process.env.S3_ENDPOINT,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
      },
    });
    await client.send(new DeleteObjectCommand({ Bucket: s3Bucket, Key: path }));
    return;
  }
  if (blobToken) {
    const { del } = await import("@vercel/blob");
    await del(path, { token: blobToken });
    return;
  }
  throw new Error("No object storage configured");
}
