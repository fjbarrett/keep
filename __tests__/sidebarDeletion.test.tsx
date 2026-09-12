import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Sidebar } from "@/components/Sidebar";
import type { Note } from "@/lib/types";

const notes: Note[] = ["Open note", "Other note"].map((title, index) => ({
  id: `note-${index}`, title, body: title, pinned: false, archived: false,
  trashed: true, markdown: false, highlight: false, tags: [], shareToken: null,
  createdAt: 1, updatedAt: 1,
}));

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  vi.stubGlobal("CSS", { escape: (value: string) => value });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function setup(trashed = true) {
  const remove = vi.fn();
  const trash = vi.fn();
  const onOpenNote = vi.fn();
  render(
    <Sidebar
      hydrated filtered={notes.map((note) => ({ ...note, trashed }))}
      activeNoteId={notes[0].id} viewMode={trashed ? "trash" : "active"}
      syncStatus="idle" onExitFilteredView={vi.fn()} onOpenNote={onOpenNote}
      onNewNote={vi.fn()} onOpenSearch={vi.fn()} onOpenSettings={vi.fn()}
      onOpenShortcuts={vi.fn()} togglePin={vi.fn()} toggleArchive={vi.fn()}
      trash={trash} restore={vi.fn()} remove={remove} onRename={vi.fn()}
      onInfo={vi.fn()} onColor={vi.fn()}
    />,
  );
  const row = screen.getByRole("button", { name: "Other note" }).closest("li")!;
  fireEvent.contextMenu(row);
  fireEvent.click(screen.getByRole("menuitem", { name: trashed ? "Delete forever" : "Move to Trash" }));
  return { row, remove, trash, onOpenNote };
}

it("confirms permanent deletion inside the targeted sidebar item without opening it", () => {
  const nativeConfirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  const { row, remove, onOpenNote } = setup();
  const dialog = within(row).getByRole("alertdialog", { name: "Permanently delete Other note?" });

  expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "Cancel" }));
  expect(remove).not.toHaveBeenCalled();
  expect(onOpenNote).not.toHaveBeenCalled();
  expect(nativeConfirm).not.toHaveBeenCalled();

  fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
  expect(remove).toHaveBeenCalledExactlyOnceWith("note-1");
  expect(onOpenNote).not.toHaveBeenCalled();
  expect(screen.queryByRole("alertdialog")).toBeNull();
});

it.each(["Cancel", "Escape"])("dismisses with %s and returns focus without deleting", async (action) => {
  const { row, remove } = setup();
  const cancel = within(row).getByRole("button", { name: "Cancel" });
  const globalKey = vi.fn();
  window.addEventListener("keydown", globalKey);
  try {
    if (action === "Cancel") fireEvent.click(cancel);
    else fireEvent.keyDown(cancel, { key: "Escape" });

    expect(remove).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(globalKey).not.toHaveBeenCalled();
    await waitFor(() => expect(document.activeElement).toBe(within(row).getByRole("button", { name: "Note options" })));
  } finally {
    window.removeEventListener("keydown", globalKey);
  }
});

it("dismisses when focus leaves the item without deleting", () => {
  const { remove } = setup();
  fireEvent.blur(screen.getByRole("button", { name: "Cancel" }), {
    relatedTarget: screen.getByRole("button", { name: "New" }),
  });
  expect(screen.queryByRole("alertdialog")).toBeNull();
  expect(remove).not.toHaveBeenCalled();
});

it("still moves an active item to Trash directly", () => {
  const { trash, remove } = setup(false);
  expect(trash).toHaveBeenCalledExactlyOnceWith("note-1");
  expect(remove).not.toHaveBeenCalled();
  expect(screen.queryByRole("alertdialog")).toBeNull();
});
