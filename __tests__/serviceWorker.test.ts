// @vitest-environment node
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { expect, it, vi } from "vitest";

it("registers cache refresh work synchronously and skips private and unversioned assets", async () => {
  const listeners: Record<string, (event: unknown) => void> = {};
  const put = vi.fn();
  const fetch = vi.fn(async () => new Response("new bytes"));
  runInNewContext(readFileSync("public/sw.js", "utf8"), {
    self: { addEventListener: (type: string, handler: (event: unknown) => void) => listeners[type] = handler,
      location: { origin: "https://keep.test" } }, URL, Response, fetch,
    caches: { match: async () => new Response("cached bytes"), open: async () => ({ put }) },
  });
  const work: Promise<unknown>[] = [];
  const event = { request: new Request("https://keep.test/_next/static/chunk.js"),
    waitUntil: vi.fn((promise: Promise<unknown>) => work.push(promise)), respondWith: vi.fn() };
  listeners.fetch(event);
  expect(event.waitUntil).toHaveBeenCalledOnce();
  await Promise.all(work);
  expect(put).toHaveBeenCalledOnce();
  expect(await (await event.respondWith.mock.calls[0][0]).text()).toBe("cached bytes");
  for (const path of ["/pdf.worker.min.mjs", "/api/uploads/private", "/p/private"]) {
    const respondWith = vi.fn();
    listeners.fetch({ ...event, respondWith, request: new Request("https://keep.test" + path) });
    expect(respondWith).not.toHaveBeenCalled();
  }
});
