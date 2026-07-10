import { Header } from "@/components/Header";
import { NotesView } from "@/components/NotesView";
import { auth } from "@/auth";

// The page is usable for guests. Header shows auth state server-side; NotesView
// stores guest notes locally and syncs them after sign-in.
export default async function Page() {
  const session = await auth();
  return (
    <>
      <Header />
      <NotesView initialNoteId={null} ownerId={session?.user?.id ?? null} />
    </>
  );
}
