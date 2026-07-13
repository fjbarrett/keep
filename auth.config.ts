import type { NextAuthConfig } from "next-auth";

// DB-free slice of the auth config used by proxy.ts. Keep this file
// free of Node-only imports (pg, etc.) — the full config in auth.ts
// re-exports providers and callbacks that need Node.
export const authConfig: NextAuthConfig = {
  providers: [],
  session: { strategy: "jwt", maxAge: 7 * 24 * 60 * 60 },
  pages: { signIn: "/signin" },
  callbacks: {
    session({ session, token }) {
      if (session.user && token.sub) session.user.id = token.sub;
      return session;
    },
  },
};
