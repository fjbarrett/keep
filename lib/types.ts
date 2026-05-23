export type Note = {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  archived: boolean;
  trashed: boolean;
  createdAt: number;
  updatedAt: number;
};

export type View = "all" | "pinned" | "archive" | "trash";
