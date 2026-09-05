import { createElement } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import { NoteEditor, EditorTarget } from "@/components/NoteEditor";
import { Note } from "@/lib/types";

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: "N1",
    title: "",
    body: "",
    pinned: false,
    archived: false,
    trashed: false,
    markdown: false,
    highlight: false,
    tags: [],
    shareToken: null,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function renderEditor(target: EditorTarget) {
  const props = {
    target,
    onClose: vi.fn(),
    onCreate: vi.fn(async (partial: Partial<Note>) =>
      makeNote({ ...partial, id: "CREATED" }),
    ),
    onUpdate: vi.fn(),
    onTrash: vi.fn(),
    onRestore: vi.fn(),
    onRemove: vi.fn(),
    onShare: vi.fn(async () => null),
    onUnshare: vi.fn(async () => {}),
    canShare: false,
    presentation: "panel" as const,
  };
  const view = render(createElement(NoteEditor, props));
  return {
    ...props,
    rerenderTarget(nextTarget: EditorTarget) {
      view.rerender(createElement(NoteEditor, { ...props, target: nextTarget }));
    },
    unmount: view.unmount,
  };
}

function body() {
  return screen.getByPlaceholderText("Start writing...") as HTMLTextAreaElement;
}

async function typeBody(value: string) {
  fireEvent.change(body(), { target: { value } });
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("NoteEditor autosave", () => {
  it("creates a new note 550ms after typing stops", async () => {
    const props = renderEditor({ mode: "new" });

    await typeBody("hello");
    await advance(500);
    expect(props.onCreate).not.toHaveBeenCalled();

    await advance(100);
    expect(props.onCreate).toHaveBeenCalledTimes(1);
    expect(props.onCreate).toHaveBeenCalledWith(
      expect.objectContaining({ body: "hello" }),
    );
  });

  it("resets the debounce on every keystroke", async () => {
    const props = renderEditor({ mode: "new" });

    await typeBody("h");
    await advance(400);
    await typeBody("he");
    await advance(400);
    await typeBody("hel");
    expect(props.onCreate).not.toHaveBeenCalled();

    await advance(600);
    expect(props.onCreate).toHaveBeenCalledTimes(1);
    expect(props.onCreate).toHaveBeenCalledWith(
      expect.objectContaining({ body: "hel" }),
    );
  });

  it("does not create a note for whitespace-only body", async () => {
    const props = renderEditor({ mode: "new" });

    await typeBody("   \n  ");
    await advance(2000);
    expect(props.onCreate).not.toHaveBeenCalled();
  });

  it("routes keystrokes after creation to update, not a second create", async () => {
    const props = renderEditor({ mode: "new" });

    await typeBody("first line");
    await advance(600);
    expect(props.onCreate).toHaveBeenCalledTimes(1);

    await typeBody("first line, then more");
    await advance(600);
    expect(props.onCreate).toHaveBeenCalledTimes(1);
    expect(props.onUpdate).toHaveBeenCalledWith(
      "CREATED",
      expect.objectContaining({ body: "first line, then more" }),
    );
  });

  it("flushes text typed while the initial create request is in flight", async () => {
    let finishCreate!: (note: Note) => void;
    const onCreate = vi.fn(
      () => new Promise<Note>((resolve) => { finishCreate = resolve; }),
    );
    const onUpdate = vi.fn(async () => {});
    render(
      createElement(NoteEditor, {
        target: { mode: "new" },
        onClose: vi.fn(),
        onCreate,
        onUpdate,
        onTrash: vi.fn(),
        onRestore: vi.fn(),
        onRemove: vi.fn(),
        presentation: "panel" as const,
      }),
    );

    await typeBody("first snapshot");
    await advance(600);
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ body: "first snapshot" }));

    await typeBody("newer text typed during save");
    await act(async () => finishCreate(makeNote({ id: "CREATED" })));

    expect(onUpdate).toHaveBeenCalledWith(
      "CREATED",
      expect.objectContaining({ body: "newer text typed during save" }),
    );
  });

  it("debounces updates to an existing note", async () => {
    const note = makeNote({ id: "N42", body: "old" });
    const props = renderEditor({ mode: "edit", note });

    await typeBody("new body");
    await advance(500);
    expect(props.onUpdate).not.toHaveBeenCalled();

    await advance(100);
    expect(props.onUpdate).toHaveBeenCalledTimes(1);
    expect(props.onUpdate).toHaveBeenCalledWith(
      "N42",
      expect.objectContaining({ body: "new body" }),
    );
  });

  it("flushes the previous note before switching targets", async () => {
    const props = renderEditor({ mode: "edit", note: makeNote({ id: "N1", body: "first" }) });

    await typeBody("first changed less than 550ms ago");
    props.rerenderTarget({ mode: "edit", note: makeNote({ id: "N2", body: "second" }) });

    expect(props.onUpdate).toHaveBeenCalledWith(
      "N1",
      expect.objectContaining({ body: "first changed less than 550ms ago" }),
      { base: makeNote({ id: "N1", body: "first" }) },
    );
    expect(body().value).toBe("second");
  });

  it("does not mark the new note dirty when the previous note flush fails", async () => {
    const props = renderEditor({ mode: "edit", note: makeNote({ id: "N1", body: "first" }) });
    props.onUpdate.mockRejectedValueOnce(new Error("save failed"));

    await typeBody("first changed");
    props.rerenderTarget({ mode: "edit", note: makeNote({ id: "N2", body: "second" }) });
    await advance(600);

    expect(props.onUpdate).toHaveBeenCalledTimes(1);
    expect(props.onUpdate).not.toHaveBeenCalledWith("N2", expect.anything());
    expect(body().value).toBe("second");
  });

  it("flushes pending edits with keepalive on pagehide", async () => {
    const props = renderEditor({ mode: "edit", note: makeNote({ id: "N42", body: "old" }) });

    await typeBody("survives tab close");
    fireEvent(window, new Event("pagehide"));

    expect(props.onUpdate).toHaveBeenCalledWith(
      "N42",
      expect.objectContaining({ body: "survives tab close" }),
      { keepalive: true },
    );
  });

  it("flushes pending edits with keepalive when the page becomes hidden", async () => {
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    const props = renderEditor({ mode: "edit", note: makeNote({ id: "N42", body: "old" }) });

    await typeBody("survives backgrounding");
    fireEvent(document, new Event("visibilitychange"));

    expect(props.onUpdate).toHaveBeenCalledWith(
      "N42",
      expect.objectContaining({ body: "survives backgrounding" }),
      { keepalive: true },
    );
  });

  it("flushes pending edits with keepalive when the editor unmounts", async () => {
    const props = renderEditor({ mode: "edit", note: makeNote({ id: "N42", body: "old" }) });

    await typeBody("survives unmount");
    props.unmount();

    expect(props.onUpdate).toHaveBeenCalledWith(
      "N42",
      expect.objectContaining({ body: "survives unmount" }),
      { keepalive: true },
    );
  });

  it("flushes pending edits when the editor closes via Escape", async () => {
    const note = makeNote({ id: "N42", body: "old" });
    const props = renderEditor({ mode: "edit", note });

    await typeBody("unsaved change");
    fireEvent.keyDown(window, { key: "Escape" });

    expect(props.onUpdate).toHaveBeenCalledWith(
      "N42",
      expect.objectContaining({ body: "unsaved change" }),
    );
    expect(props.onClose).toHaveBeenCalled();
  });

  it("does not mark an unchanged note as edited when it closes", () => {
    const props = renderEditor({ mode: "edit", note: makeNote({ id: "N42", body: "old" }) });

    fireEvent.keyDown(window, { key: "Escape" });

    expect(props.onUpdate).not.toHaveBeenCalled();
    expect(props.onClose).toHaveBeenCalled();
  });

  it("persists markdown preview mode per note", async () => {
    const props = renderEditor({ mode: "edit", note: makeNote({ id: "N42", body: "# Heading" }) });

    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    fireEvent.click(screen.getByRole("button", { name: "Preview markdown" }));
    await advance(600);

    expect(props.onUpdate).toHaveBeenCalledWith(
      "N42",
      expect.objectContaining({ markdown: true, highlight: false }),
    );
  });
});

describe("editor asynchronous work", () => {
  it("keeps intervening typing when an image finishes uploading", async () => {
    let finish!: (value: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => { finish = resolve; })));
    renderEditor({ mode: "edit", note: makeNote({ body: "original" }) });
    body().setSelectionRange(8, 8);
    fireEvent.paste(body(), { clipboardData: { items: [{ type: "image/png",
      getAsFile: () => new File(["image"], "example.png", { type: "image/png" }) }] } });
    await typeBody("original important new text");
    await act(async () => finish(Response.json({ url: "/api/uploads/image" })));
    expect(body().value).toContain("important new text");
    expect(body().value).toContain("![example.png](/api/uploads/image)");
  });

  it("ignores an upload belonging to a previously open note", async () => {
    let finish!: (value: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => { finish = resolve; })));
    const props = renderEditor({ mode: "edit", note: makeNote({ body: "original" }) });
    fireEvent.paste(body(), { clipboardData: { items: [{ type: "image/png",
      getAsFile: () => new File(["image"], "example.png", { type: "image/png" }) }] } });
    props.rerenderTarget({ mode: "edit", note: makeNote({ id: "N2", body: "second" }) });
    await act(async () => finish(Response.json({ url: "/api/uploads/image" })));
    expect(body().value).toBe("second");
    expect(props.onUpdate).not.toHaveBeenCalled();
  });

  it("flushes the latest new-note text before its create response arrives", async () => {
    const props = renderEditor({ mode: "new" });
    props.onCreate.mockImplementation(() => new Promise<Note>(() => {}));
    await typeBody("first");
    await advance(600);
    const id = props.onCreate.mock.calls[0][0].id;
    expect(id).toBeTruthy();
    await typeBody("first plus latest");
    fireEvent(window, new Event("pagehide"));
    expect(props.onUpdate).toHaveBeenCalledWith(id,
      expect.objectContaining({ body: "first plus latest" }), { keepalive: true });
  });

  it("does not apply a late create response to the next note", async () => {
    let finish!: (note: Note) => void;
    const props = renderEditor({ mode: "new" });
    props.onCreate.mockImplementation(() => new Promise<Note>((resolve) => { finish = resolve; }));
    await typeBody("new note");
    await advance(600);
    props.rerenderTarget({ mode: "edit", note: makeNote({ id: "N2", body: "second" }) });
    await typeBody("second edited");
    await act(async () => finish(makeNote({ id: "CREATED", body: "new note" })));
    expect(body().value).toBe("second edited");
    expect(props.onUpdate).not.toHaveBeenCalledWith("CREATED", expect.anything());
    await advance(600);
    expect(props.onUpdate).toHaveBeenCalledWith("N2", expect.objectContaining({ body: "second edited" }));
  });

  it("shows a remote refresh in a clean editor without saving it back", async () => {
    const props = renderEditor({ mode: "edit", note: makeNote({ body: "old" }) });
    props.rerenderTarget({ mode: "edit", note: makeNote({ body: "remote", updatedAt: 2 }) });
    expect(body().value).toBe("remote");
    await advance(600);
    expect(props.onUpdate).not.toHaveBeenCalled();
  });

  it("keeps dirty text and its original version when a remote refresh arrives", async () => {
    const original = makeNote({ body: "old" });
    const props = renderEditor({ mode: "edit", note: original });
    await typeBody("local edit");
    props.rerenderTarget({ mode: "edit", note: makeNote({ body: "remote", updatedAt: 2 }) });
    expect(body().value).toBe("local edit");
    await advance(600);
    expect(props.onUpdate).toHaveBeenCalledWith("N1", expect.objectContaining({ body: "local edit" }),
      { base: original });
  });
});
