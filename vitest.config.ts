import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  // Next.js requires tsconfig jsx: "preserve"; vitest (rolldown) needs JSX compiled.
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    environment: "jsdom",
    include: ["__tests__/**/*.test.ts", "__tests__/**/*.test.tsx"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
    },
  },
});
