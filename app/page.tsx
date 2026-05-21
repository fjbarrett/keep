import { Header } from "@/components/Header";
import { NotesView } from "@/components/NotesView";

// The middleware guarantees an authenticated session at this point, so the
// page itself doesn't need to re-check. Header reads the session server-side
// for the avatar / signout button; NotesView is the client-side notes UI.
export default function Page() {
  return (
    <>
      <Header />
      <NotesView />
    </>
  );
}
