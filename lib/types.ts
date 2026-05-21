export const TINTS = [
  "natural",
  "clay",
  "rose",
  "mist",
  "sage",
  "sun",
  "violet",
] as const;

export type Tint = (typeof TINTS)[number];

export const TINT_HEX: Record<Tint, string> = {
  natural: "#F8F2E2",
  clay: "#E8C9B5",
  rose: "#EDB5B8",
  mist: "#C9D8DE",
  sage: "#C9D9BC",
  sun: "#ECD9A6",
  violet: "#CCC5DA",
};

export const TINT_NAME: Record<Tint, string> = {
  natural: "Natural",
  clay: "Clay",
  rose: "Rose",
  mist: "Mist",
  sage: "Sage",
  sun: "Sun",
  violet: "Violet",
};

export type Note = {
  id: string;
  title: string;
  body: string;
  tint: Tint;
  pinned: boolean;
  archived: boolean;
  createdAt: number;
  updatedAt: number;
};

export type View = "all" | "pinned" | "archive";
