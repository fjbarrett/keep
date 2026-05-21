import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Tints stay explicit — small color indicators on rows
        tint: {
          natural: "#9C9A93",
          clay: "#C28666",
          rose: "#C26F76",
          mist: "#6E92A6",
          sage: "#7CA086",
          sun: "#C7A961",
          violet: "#9189C7",
        },
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
