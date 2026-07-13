import { afterEach, describe, expect, it, vi } from "vitest";
import { generateNoteMeta } from "@/lib/titleModel";

afterEach(() => {
  delete process.env.AI_METADATA_ENABLED;
  delete process.env.ANTHROPIC_KEY;
  vi.unstubAllGlobals();
});

describe("AI metadata privacy gate", () => {
  it("does not send note text when explicit opt-in is absent", async () => {
    process.env.ANTHROPIC_KEY = "test-key";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(generateNoteMeta("private note body")).resolves.toMatchObject({
      title: "private note body",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("caps provider text at 8 KiB when enabled", async () => {
    process.env.AI_METADATA_ENABLED = "true";
    process.env.ANTHROPIC_KEY = "test-key";
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      content: [{ text: '"title":"Generated","summary":"Short"}' }],
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await generateNoteMeta("a".repeat(20 * 1024));
    const request = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(request.messages[0].content).toHaveLength(8 * 1024);
  });
});
