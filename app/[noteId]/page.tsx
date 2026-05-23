import { Header } from "@/components/Header";
import { NotesView } from "@/components/NotesView";

export default function NotePage({
  params,
}: {
  params: { noteId: string };
}) {
  return (
    <>
      <Header />
      <NotesView initialNoteId={params.noteId} />
    </>
  );
}
