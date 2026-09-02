import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotesView } from "@/components/NotesView";

const notesState = vi.hoisted(() => ({
  notes: [],
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

vi.mock("@/lib/useNotes", () => ({
  useNotes: () => notesState,
}));

vi.mock("@/components/Sidebar", () => ({
  Sidebar: () => <aside aria-label="Texts" />,
}));

describe("NotesView deep links", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/note/missing-note");
  });

  it("leaves the restoring state when an empty account has no matching note", async () => {
    render(<NotesView initialNoteId="missing-note" ownerId={null} />);

    await waitFor(() => {
      expect(screen.getByText("No texts yet")).toBeTruthy();
    });
    expect(window.location.pathname).toBe("/");
  });
});
