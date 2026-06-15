import { Header } from "@/components/Header";
import { NotesView } from "@/components/NotesView";

// NotesView rewrites the URL to /<noteId> as notes open; this route makes
// those URLs real so refresh and bookmarks land back on the same note.
export default function Page({ params }: { params: { noteId: string } }) {
  return (
    <>
      <Header />
      <NotesView initialNoteId={params.noteId} />
    </>
  );
}
