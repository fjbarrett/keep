import { View } from "@/lib/types";

const copy: Record<View, { title: string; sub: string }> = {
  all: {
    title: "No notes yet",
    sub: "Create your first note to get started.",
  },
  pinned: {
    title: "Nothing pinned",
    sub: "Pin a note to find it here.",
  },
  archive: {
    title: "Archive is empty",
    sub: "Archived notes will rest here. Unarchive them anytime.",
  },
  trash: {
    title: "Trash is empty",
    sub: "Deleted notes will appear here before they are removed forever.",
  },
};

export function EmptyState({ view }: { view: View }) {
  const { title, sub } = copy[view];
  return (
    <div className="rounded-lg border border-dashed border-[var(--color-border)] px-6 py-16 text-center">
      <p className="text-sm font-medium text-[var(--color-text)]">{title}</p>
      <p className="mt-1 text-xs text-[var(--color-muted)]">{sub}</p>
    </div>
  );
}
