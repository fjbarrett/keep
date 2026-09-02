import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotesGrid } from "@/components/NotesGrid";
import { Note } from "@/lib/types";

function note(id: string, title: string, body: string): Note {
  return {
    id,
    title,
    body,
    summary: null,
    color: null,
    pinned: false,
    archived: false,
    trashed: false,
    markdown: false,
    highlight: false,
    tags: [],
    shareToken: null,
    createdAt: 1,
    updatedAt: 1,
  };
}

const handlers = {
  onOpen: vi.fn(),
  onTogglePin: vi.fn(),
  onToggleArchive: vi.fn(),
  onTrash: vi.fn(),
  onRestore: vi.fn(),
  onRemove: vi.fn(),
  onColor: vi.fn(),
};

describe("NotesGrid", () => {
  afterEach(cleanup);

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("marks the matching card as the current note", () => {
    render(
      <NotesGrid
        notes={[
          note("one", "First", "First body"),
          note("two", "Second", "Second body"),
        ]}
        activeNoteId="two"
        viewMode="active"
        trashMode={false}
        scrollMemory={{ current: 0 }}
        {...handlers}
      />,
    );

    expect(
      screen
        .getByRole("button", { name: "Open Second" })
        .getAttribute("aria-current"),
    ).toBe("true");
    expect(screen.getByText("2")).toBeTruthy();
  });

  it("persists the chosen card density", () => {
    render(
      <NotesGrid
        notes={[note("one", "First", "First body")]}
        activeNoteId={null}
        viewMode="active"
        trashMode={false}
        scrollMemory={{ current: 0 }}
        {...handlers}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Comfortable" }));

    expect(localStorage.getItem("keep.gridDensity")).toBe("comfortable");
    expect(
      screen
        .getByRole("button", { name: "Comfortable" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });
});
