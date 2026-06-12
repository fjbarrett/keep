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
  render(createElement(NoteEditor, props));
  return props;
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
});
