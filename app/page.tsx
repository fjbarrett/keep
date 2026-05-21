"use client";

import { useMemo, useState } from "react";
import { useNotes } from "@/lib/useNotes";
import { View } from "@/lib/types";
import { Header } from "@/components/Header";
import { NoteList, SectionLabel } from "@/components/NoteList";
import { NoteEditor, EditorTarget } from "@/components/NoteEditor";
import { EmptyState } from "@/components/EmptyState";

const VIEW_TITLES: Record<View, string> = {
  all: "Your notes",
  pinned: "Pinned",
  archive: "Archive",
};

export default function Page() {
  const {
    notes,
    hydrated,
    error,
    refresh,
    create,
    update,
    remove,
    togglePin,
    toggleArchive,
    setTint,
  } = useNotes();

  const [view, setView] = useState<View>("all");
  const [query, setQuery] = useState("");
  const [target, setTarget] = useState<EditorTarget>(null);

  const counts = useMemo(
    () => ({
      all: notes.filter((n) => !n.archived).length,
      pinned: notes.filter((n) => n.pinned && !n.archived).length,
      archive: notes.filter((n) => n.archived).length,
    }),
    [notes],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return notes
      .filter((n) => {
        if (view === "archive") return n.archived;
        if (view === "pinned") return n.pinned && !n.archived;
        return !n.archived;
      })
      .filter((n) => {
        if (!q) return true;
        return (
          n.title.toLowerCase().includes(q) ||
          n.body.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [notes, view, query]);

  const pinned = view === "all" ? filtered.filter((n) => n.pinned) : [];
  const others = view === "all" ? filtered.filter((n) => !n.pinned) : filtered;

  function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const titleEl = form.elements.namedItem("title") as HTMLInputElement | null;
    const title = titleEl?.value?.trim();
    if (!title) return;
    create({ title, body: "", tint: "natural" });
    form.reset();
  }

  return (
    <>
      <Header />

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">
        {error && <DbError error={error} onRetry={refresh} />}

        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-text)]">
                {VIEW_TITLES[view]}
              </h1>
              <p className="text-sm text-[var(--color-muted)]">
                {hydrated
                  ? `${filtered.length} ${filtered.length === 1 ? "note" : "notes"}`
                  : "loading…"}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search notes…"
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-muted)] shadow-sm focus:border-[var(--color-text)] focus:outline-none"
              />
              <form onSubmit={handleCreate} className="flex items-center gap-2">
                <input
                  name="title"
                  placeholder="New note title…"
                  className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-muted)] shadow-sm focus:border-[var(--color-text)] focus:outline-none"
                  required
                />
                <button
                  type="submit"
                  className="rounded-md bg-[var(--color-accent)] px-3 py-2 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)]"
                >
                  Create
                </button>
              </form>
            </div>
          </div>

          <ViewTabs view={view} setView={setView} counts={counts} />

          {!hydrated ? null : filtered.length === 0 ? (
            query ? (
              <NoResults query={query} />
            ) : (
              <EmptyState view={view} />
            )
          ) : (
            <div className="flex flex-col gap-6">
              {view === "all" && pinned.length > 0 && (
                <section>
                  <SectionLabel label="Pinned" count={pinned.length} />
                  <NoteList
                    notes={pinned}
                    onOpen={(n) => setTarget({ mode: "edit", note: n })}
                    onTogglePin={togglePin}
                    onToggleArchive={toggleArchive}
                    onRemove={remove}
                    onSetTint={setTint}
                  />
                </section>
              )}

              <section>
                {view === "all" && pinned.length > 0 && others.length > 0 && (
                  <SectionLabel label="Others" count={others.length} />
                )}
                <NoteList
                  notes={others}
                  onOpen={(n) => setTarget({ mode: "edit", note: n })}
                  onTogglePin={togglePin}
                  onToggleArchive={toggleArchive}
                  onRemove={remove}
                  onSetTint={setTint}
                />
              </section>
            </div>
          )}
        </div>
      </main>

      <NoteEditor
        target={target}
        onClose={() => setTarget(null)}
        onCreate={create}
        onUpdate={update}
        onRemove={remove}
      />
    </>
  );
}

function ViewTabs({
  view,
  setView,
  counts,
}: {
  view: View;
  setView: (v: View) => void;
  counts: { all: number; pinned: number; archive: number };
}) {
  const tabs: { key: View; label: string; count: number }[] = [
    { key: "all", label: "All", count: counts.all },
    { key: "pinned", label: "Pinned", count: counts.pinned },
    { key: "archive", label: "Archive", count: counts.archive },
  ];
  return (
    <div className="flex items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-1 self-start">
      {tabs.map((t) => {
        const active = view === t.key;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => setView(t.key)}
            className={`flex items-center gap-1.5 rounded-sm px-3 py-1 text-xs font-medium transition-colors ${
              active
                ? "bg-[var(--color-background)] text-[var(--color-text)]"
                : "text-[var(--color-muted)] hover:text-[var(--color-text)]"
            }`}
          >
            {t.label}
            <span
              className={`font-mono text-[10px] ${
                active ? "text-[var(--color-muted)]" : "text-[var(--color-muted)]"
              }`}
            >
              {t.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function NoResults({ query }: { query: string }) {
  return (
    <div className="rounded-lg border border-dashed border-[var(--color-border)] px-6 py-16 text-center">
      <p className="text-sm font-medium text-[var(--color-text)]">
        No notes match "{query}"
      </p>
      <p className="mt-1 text-xs text-[var(--color-muted)]">
        Try a different search term.
      </p>
    </div>
  );
}

function DbError({
  error,
  onRetry,
}: {
  error: string;
  onRetry: () => void;
}) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[var(--color-text)]">
          Couldn't reach Postgres
        </p>
        <p className="mt-0.5 truncate font-mono text-xs text-[var(--color-muted)]">
          {error}
        </p>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="shrink-0 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]"
      >
        Retry
      </button>
    </div>
  );
}
