// @vitest-environment node

import { describe, expect, it } from "vitest";
import {
  readFormDataBody,
  readJsonBody,
  RequestBodyTooLarge,
} from "@/lib/requestBody";

describe("bounded request bodies", () => {
  it("rejects an oversized body even without Content-Length", async () => {
    const request = new Request("https://keeptxt.com/api/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ value: "x".repeat(128) }),
    });
    expect(request.headers.get("content-length")).toBeNull();
    await expect(readJsonBody(request, 32)).rejects.toBeInstanceOf(RequestBodyTooLarge);
  });

  it("parses JSON within the limit", async () => {
    const request = new Request("https://keeptxt.com/api/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ok: true }),
    });
    await expect(readJsonBody(request, 128)).resolves.toEqual({ ok: true });
  });

  it("rejects simple cross-origin content types for JSON routes", async () => {
    const request = new Request("https://keeptxt.com/api/test", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: JSON.stringify({ ok: true }),
    });
    await expect(readJsonBody(request, 128)).rejects.toThrow("Invalid request body");
  });

  it("parses multipart data within the limit", async () => {
    const boundary = "keep-test-boundary";
    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="note.txt"',
      "Content-Type: text/plain",
      "",
      "hello",
      `--${boundary}--`,
      "",
    ].join("\r\n");
    const request = new Request("https://keeptxt.com/api/test", {
      method: "POST",
      headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
      body,
    });
    const parsed = await readFormDataBody(request, 4096);
    expect((parsed.get("file") as File).name).toBe("note.txt");
  });
});
