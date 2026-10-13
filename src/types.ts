export type ByteStore = "opfs" | "idb";

export type ScoreRecord = {
  id: string;
  title: string;
  pageCount: number;
  lastPage: number;
  addedAt: number;
  lastOpenedAt: number;
  storage: ByteStore;
};

export type LibraryScore = ScoreRecord & {
  thumbnailUrl: string | null;
};

export type BlobRecord = {
  id: string;
  pdf: Blob;
  thumbnail: Blob;
};
