import type { NextAuthConfig } from "next-auth";

// Edge-safe slice of the auth config used by middleware.ts. Keep this file
// free of Node-only imports (pg, @simplewebauthn/server, etc.) — the full
// config in auth.ts re-exports providers and callbacks that need Node.
export const authConfig: NextAuthConfig = {
  providers: [],
  session: { strategy: "jwt" },
  pages: { signIn: "/signin" },
  callbacks: {
    session({ session, token }) {
      if (session.user && token.sub) session.user.id = token.sub;
      return session;
    },
  },
};
