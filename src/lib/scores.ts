import { deleteScoreMeta, getAllScores, getScore, putScore } from "./db.ts";
import { isPasswordError, openPdf, renderThumbnail } from "./pdf.ts";
import { readPdfBlob, readThumbnailBlob, removeScoreBytes, storeScoreBytes } from "./storage.ts";
import { randomUuid } from "./uuid.ts";
import type { LibraryScore, ScoreRecord } from "../types.ts";

let writeQueue: Promise<void> = Promise.resolve();

function enqueue<T>(work: () => Promise<T>): Promise<T> {
  const run = writeQueue.then(work, work);
  writeQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function titleFromFileName(name: string): string {
  const trimmed = name.trim();
  const withoutExtension = trimmed.replace(/\.pdf$/i, "").trim();
  return withoutExtension || "Untitled score";
}

function looksLikePdf(bytes: Uint8Array): boolean {
  const limit = Math.min(bytes.length, 1024);
  for (let index = 0; index <= limit - 4; index += 1) {
    if (
      bytes[index] === 0x25 &&
      bytes[index + 1] === 0x50 &&
      bytes[index + 2] === 0x44 &&
      bytes[index + 3] === 0x46
    ) {
      return true;
    }
  }
  return false;
}

function pdfBlob(bytes: Uint8Array): Blob {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Blob([copy.buffer], { type: "application/pdf" });
}

function quote(name: string): string {
  return `\u201c${name}\u201d`;
}

export async function importScore(file: File): Promise<ScoreRecord> {
  const name = file.name.trim() || "That file";
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    throw new Error(`Volti couldn't read ${quote(name)}.`);
  }
  if (!looksLikePdf(bytes)) {
    throw new Error(`Volti couldn't read ${quote(name)}. Choose a PDF.`);
  }

  let opened;
  try {
    opened = await openPdf(bytes);
  } catch (error) {
    if (isPasswordError(error)) {
      throw new Error(
        `${quote(name)} is password-protected. Remove the password and import it again.`,
      );
    }
    throw new Error(`Volti couldn't read ${quote(name)}. Choose a PDF.`);
  }

  const pdf = opened.document;
  try {
    if (pdf.numPages < 1) {
      throw new Error(`Volti couldn't read ${quote(name)}. Choose a PDF.`);
    }
    let thumbnail: Blob;
    try {
      thumbnail = await renderThumbnail(pdf);
    } catch {
      throw new Error(`Volti couldn't read ${quote(name)}. Choose a PDF.`);
    }
    const now = Date.now();
    const record: ScoreRecord = {
      id: randomUuid(),
      title: titleFromFileName(file.name),
      pageCount: pdf.numPages,
      lastPage: 1,
      addedAt: now,
      lastOpenedAt: now,
      storage: "idb",
    };
    try {
      record.storage = await storeScoreBytes(record.id, pdfBlob(bytes), thumbnail);
      await enqueue(() => putScore(record));
    } catch (error) {
      await removeScoreBytes(record);
      throw error instanceof Error && error.message.startsWith("Volti")
        ? error
        : new Error(`Volti read ${quote(name)} but couldn't store it on this device.`);
    }
    return record;
  } finally {
    await opened.close();
  }
}

async function withThumbnail(score: ScoreRecord): Promise<LibraryScore> {
  try {
    const blob = await readThumbnailBlob(score);
    return { ...score, thumbnailUrl: URL.createObjectURL(blob) };
  } catch {
    return { ...score, thumbnailUrl: null };
  }
}

export function sortScores(scores: LibraryScore[]): LibraryScore[] {
  return [...scores].sort(
    (a, b) => b.lastOpenedAt - a.lastOpenedAt || b.addedAt - a.addedAt,
  );
}

export function listScores(): Promise<LibraryScore[]> {
  return enqueue(async () => {
    const records = await getAllScores();
    const withThumbs = await Promise.all(records.map((record) => withThumbnail(record)));
    return sortScores(withThumbs);
  });
}

export function renameScore(id: string, title: string): Promise<void> {
  const nextTitle = title.trim();
  return enqueue(async () => {
    const score = await getScore(id);
    if (!score || !nextTitle) return;
    score.title = nextTitle;
    await putScore(score);
  });
}

export function markOpened(id: string): Promise<void> {
  return enqueue(async () => {
    const score = await getScore(id);
    if (!score) return;
    score.lastOpenedAt = Math.max(Date.now(), score.addedAt + 1);
    await putScore(score);
  });
}

export function saveLastPage(id: string, lastPage: number): Promise<void> {
  return enqueue(async () => {
    const score = await getScore(id);
    if (!score) return;
    const page = Math.min(Math.max(1, Math.round(lastPage)), score.pageCount);
    if (score.lastPage === page) return;
    score.lastPage = page;
    await putScore(score);
  });
}

export function deleteScore(score: ScoreRecord): Promise<void> {
  return enqueue(async () => {
    await removeScoreBytes(score);
    await deleteScoreMeta(score.id);
  });
}

export async function readPdfBytes(score: ScoreRecord): Promise<Uint8Array> {
  const blob = await readPdfBlob(score);
  return new Uint8Array(await blob.arrayBuffer());
}

export function hasBeenOpened(score: ScoreRecord): boolean {
  return score.lastOpenedAt > score.addedAt;
}
