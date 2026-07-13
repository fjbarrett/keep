export class RequestBodyTooLarge extends Error {
  constructor(readonly limit: number) {
    super(`Request body exceeds ${limit} bytes`);
    this.name = "RequestBodyTooLarge";
  }
}

export class InvalidRequestBody extends Error {
  constructor() {
    super("Invalid request body");
    this.name = "InvalidRequestBody";
  }
}

/** Read at most `limit` bytes, including when Content-Length is absent or false. */
export async function readRequestBytes(req: Request, limit: number): Promise<Uint8Array> {
  const declared = req.headers.get("content-length");
  if (declared !== null) {
    const length = Number(declared);
    if (!Number.isSafeInteger(length) || length < 0 || length > limit) {
      throw new RequestBodyTooLarge(limit);
    }
  }

  if (!req.body) return new Uint8Array();
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel().catch(() => {});
        throw new RequestBodyTooLarge(limit);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export async function readJsonBody(req: Request, limit: number): Promise<unknown> {
  const contentType = req.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") throw new InvalidRequestBody();
  const bytes = await readRequestBytes(req, limit);
  const text = new TextDecoder().decode(bytes);
  try {
    return JSON.parse(text);
  } catch {
    throw new InvalidRequestBody();
  }
}

export async function readFormDataBody(req: Request, limit: number): Promise<FormData> {
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data;")) {
    throw new InvalidRequestBody();
  }
  const bytes = await readRequestBytes(req, limit);
  try {
    return await new Request(req.url, {
      method: "POST",
      headers: { "content-type": contentType },
      body: bytes.buffer as ArrayBuffer,
    }).formData();
  } catch {
    throw new InvalidRequestBody();
  }
}

export function requestBodyError(
  err: unknown,
  tooLargeMessage = "Request body is too large.",
  invalidMessage = "Invalid request body.",
) {
  if (err instanceof RequestBodyTooLarge) {
    return Response.json({ error: tooLargeMessage }, { status: 413 });
  }
  if (err instanceof InvalidRequestBody) {
    return Response.json({ error: invalidMessage }, { status: 400 });
  }
  return null;
}
