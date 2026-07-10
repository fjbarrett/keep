import { Header } from "@/components/Header";
import { NotesView } from "@/components/NotesView";
import { auth } from "@/auth";

// NotesView rewrites the URL to /<noteId> as notes open; this route makes
// those URLs real so refresh and bookmarks land back on the same note.
export default async function Page({ params }: { params: Promise<{ noteId: string }> }) {
  const session = await auth();
  const { noteId } = await params;
  return (
    <>
      <Header />
      <NotesView initialNoteId={noteId} ownerId={session?.user?.id ?? null} />
    </>
  );
}
