export type Note = {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  archived: boolean;
  trashed: boolean;
  markdown: boolean;
  highlight: boolean;
  tags: string[];
  shareToken: string | null;
  createdAt: number;
  updatedAt: number;
};

