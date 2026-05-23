export type Note = {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  archived: boolean;
  trashed: boolean;
  shareToken: string | null;
  createdAt: number;
  updatedAt: number;
};

