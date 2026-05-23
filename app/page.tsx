import { Header } from "@/components/Header";
import { NotesView } from "@/components/NotesView";

// The page is usable for guests. Header shows auth state server-side; NotesView
// stores guest notes locally and syncs them after sign-in.
export default function Page() {
  return (
    <>
      <Header />
      <NotesView initialNoteId={null} />
    </>
  );
}
