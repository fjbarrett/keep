import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotesView } from "@/components/NotesView";
import type { Note } from "@/lib/types";

const routerState = vi.hoisted(() => ({
  pathname: "/",
  replace: vi.fn((href: string) => {
    routerState.pathname = new URL(href, window.location.href).pathname;
    window.history.replaceState(null, "", href);
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => routerState,
  usePathname: () => routerState.pathname,
}));

const notesState = vi.hoisted(() => ({
  notes: [] as Note[],
  hydrated: true,
  isGuest: true,
  hasLocalNotes: false,
  error: null,
  refresh: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  trash: vi.fn(),
  restore: vi.fn(),
  importKeepFile: vi.fn(),
  importTextFiles: vi.fn(),
  saveLocalNotes: vi.fn(),
  togglePin: vi.fn(),
  toggleArchive: vi.fn(),
  share: vi.fn(),
  unshare: vi.fn(),
  setShareToken: vi.fn(),
  syncStatus: "idle" as const,
}));

function note(id: string, title: string, body: string): Note {
  return {
    id,
    title,
    body,
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

vi.mock("@/lib/useNotes", () => ({
  useNotes: () => notesState,
}));

vi.mock("@/components/Sidebar", () => ({
  Sidebar: ({
    filtered,
    onOpenNote,
  }: {
    filtered: Note[];
    onOpenNote: (note: Note) => void;
  }) => (
    <aside aria-label="Texts">
      {filtered.map((item) => (
        <button key={item.id} onClick={() => onOpenNote(item)}>
          Open {item.id}
        </button>
      ))}
    </aside>
  ),
}));

afterEach(cleanup);

describe("NotesView deep links", () => {
  beforeEach(() => {
    notesState.notes = [];
    notesState.hydrated = true;
    routerState.replace.mockClear();
    routerState.pathname = "/note/missing-note";
    window.history.replaceState(null, "", "/note/missing-note");
  });

  it("leaves the restoring state when an empty account has no matching note", async () => {
    render(<NotesView initialNoteId="missing-note" ownerId={null} />);

    await waitFor(() => {
      expect(screen.getByText(/No (?:texts|notes) yet/)).toBeTruthy();
    });
    expect(window.location.pathname).toBe("/");
    expect(routerState.replace).toHaveBeenCalledWith("/", { scroll: false });
  });

  it("restores a direct note URL without creating another history entry", async () => {
    notesState.notes = [note("N42", "Direct note", "opened from the route")];
    routerState.pathname = "/note/N42";
    window.history.replaceState(null, "", "/note/N42");

    render(<NotesView initialNoteId="N42" ownerId={null} />);

    await waitFor(() => {
      expect(screen.getAllByDisplayValue("opened from the route")).toHaveLength(2);
    });
    expect(routerState.replace).not.toHaveBeenCalled();
  });

  it("does not route away from a direct note while notes are hydrating", async () => {
    notesState.notes = [note("N42", "Delayed note", "loaded after hydration")];
    notesState.hydrated = false;
    routerState.pathname = "/note/N42";
    window.history.replaceState(null, "", "/note/N42");
    const view = render(<NotesView initialNoteId="N42" ownerId={null} />);

    expect(routerState.replace).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe("/note/N42");

    notesState.hydrated = true;
    view.rerender(<NotesView initialNoteId="N42" ownerId={null} />);

    await waitFor(() => {
      expect(screen.getAllByDisplayValue("loaded after hydration")).toHaveLength(2);
    });
    expect(routerState.replace).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe("/note/N42");
  });

  it("closes the note when browser history returns to the notes route", async () => {
    notesState.notes = [note("N42", "History note", "history body")];
    routerState.pathname = "/note/N42";
    window.history.replaceState(null, "", "/note/N42");
    const view = render(<NotesView initialNoteId="N42" ownerId={null} />);
    await waitFor(() => expect(screen.getAllByDisplayValue("history body")).toHaveLength(2));

    routerState.pathname = "/";
    window.history.replaceState(null, "", "/");
    view.rerender(<NotesView initialNoteId="N42" ownerId={null} />);

    await waitFor(() => expect(screen.queryAllByDisplayValue("history body")).toHaveLength(0));
    expect(window.location.pathname).toBe("/");
  });

  it("keeps routing after a note was opened from the grid", async () => {
    notesState.notes = [
      note("N42", "Grid note", "grid body"),
      note("N43", "Next note", "next body"),
    ];
    routerState.pathname = "/";
    window.history.replaceState(null, "", "/");
    const view = render(<NotesView initialNoteId={null} ownerId={null} />);

    const card = screen.getByText("Grid note").closest('[role="button"]');
    expect(card).toBeTruthy();
    fireEvent.click(card!);
    await waitFor(() => {
      expect(routerState.replace).toHaveBeenCalledWith("/note/N42", { scroll: false });
    });

    view.rerender(<NotesView initialNoteId={null} ownerId={null} />);
    await waitFor(() => expect(screen.getAllByDisplayValue("grid body")).toHaveLength(2));
    fireEvent.click(screen.getAllByRole("button", { name: "Open N43" })[0]);

    await waitFor(() => {
      expect(routerState.replace).toHaveBeenLastCalledWith("/note/N43", { scroll: false });
    });
  });
});
