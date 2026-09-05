// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import JSZip from "jszip";
import { MAX_NOTE_BODY } from "@/lib/noteLimits";
import { downloadDisposition } from "@/lib/downloadDisposition";
import { importGuestKeepFile, readImportedTextBodies } from "@/lib/noteImportClient";
const mocks = vi.hoisted(() => ({ query: vi.fn(), metadata: vi.fn() }));
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: "owner" } }) }));
vi.mock("@/lib/db", () => ({ ready: async () => {}, pool: () => ({ query: mocks.query }), rowToNote: (n: unknown) => n }));
vi.mock("@/lib/notesClient", () => ({ localNoteId: () => "id", metadataForBody: mocks.metadata }));
import { GET as exportNotes } from "@/app/api/notes/export/route";
import { GET as publicText } from "@/app/p/[token]/raw.txt/route";
import { POST as importNotes } from "@/app/api/notes/import/route";

beforeEach(() => { mocks.query.mockReset(); mocks.metadata.mockReset(); });

it("downloads Unicode titles through both routes", async () => {
  const body = "日本語のメモ 📝";
  mocks.query.mockResolvedValue({ rows: [{ id: "a".repeat(32), title: body, body }] });
  for (const response of [await exportNotes(), await publicText(new Request("https://keep.test"),
    { params: Promise.resolve({ token: "token" }) })]) {
    expect(response.status).toBe(200);
    expect(await response.text()).toContain(body);
    const header = response.headers.get("Content-Disposition")!;
    expect(header).toMatch(/^[\x20-\x7e]+$/);
    expect(decodeURIComponent(header.split("filename*=UTF-8''")[1])).toContain("日本語のメモ");
  }
});

it("sanitizes header controls, quotes and malformed Unicode", () => {
  const header = downloadDisposition("attachment", 'a";\r\nX-Header: injected/\ud800.txt');
  expect(() => new Response("", { headers: { "Content-Disposition": header } })).not.toThrow();
  expect(header).not.toMatch(/[\r\n]/);
  expect(header).toContain("%EF%BF%BD.txt");
});

async function keepUpload(body: string) {
  const form = new FormData();
  form.set("file", new File([JSON.stringify({ textContent: body })], "note.json"));
  return importNotes(new Request("https://keep.test/api/notes/import", { method: "POST", body: form }));
}

it("rejects oversized Takeout notes before querying or inserting", async () => {
  const response = await keepUpload("x".repeat(MAX_NOTE_BODY + 1));
  expect(response.status).toBe(413);
  expect(await response.json()).toMatchObject({ error: expect.stringContaining("No notes were imported") });
  expect(mocks.query).not.toHaveBeenCalled();
});

it("accepts a Takeout note at the normal editor boundary", async () => {
  mocks.query.mockResolvedValueOnce({ rows: [{ count: "0" }] }).mockResolvedValueOnce({ rowCount: 1 });
  expect((await keepUpload("x".repeat(MAX_NOTE_BODY))).status).toBe(200);
  expect(mocks.query.mock.calls[1][1][4]).toHaveLength(MAX_NOTE_BODY);
});

it("validates guest imports before metadata requests", async () => {
  const file = new File([JSON.stringify({ textContent: "x".repeat(MAX_NOTE_BODY + 1) })], "note.json");
  await expect(importGuestKeepFile(file)).rejects.toThrow("No notes were imported");
  expect(mocks.metadata).not.toHaveBeenCalled();
});

it("rejects a mixed text ZIP as a whole when one note is too large", async () => {
  const zip = new JSZip().file("small.txt", "valid").file("large.txt", "x".repeat(MAX_NOTE_BODY + 1));
  const file = new File([await zip.generateAsync({ type: "arraybuffer" })], "notes.zip");
  await expect(readImportedTextBodies(file)).rejects.toThrow("Split it into smaller notes");
  await expect(readImportedTextBodies(new File(["📝".repeat(MAX_NOTE_BODY / 2)], "note.txt")))
    .resolves.toEqual(["📝".repeat(MAX_NOTE_BODY / 2)]);
});
