import { deleteBlobs, getBlobs, putBlobs } from "./db.ts";
import type { ByteStore, ScoreRecord } from "../types.ts";

let opfsAvailable: boolean | null = null;

async function opfsRoot(): Promise<FileSystemDirectoryHandle> {
  if (!navigator.storage?.getDirectory) {
    throw new Error("OPFS is unavailable.");
  }
  return navigator.storage.getDirectory();
}

export async function canUseOpfs(): Promise<boolean> {
  if (opfsAvailable !== null) return opfsAvailable;
  try {
    const root = await opfsRoot();
    const probe = await root.getFileHandle("volti-probe", { create: true });
    const writable = await probe.createWritable();
    await writable.write(new Blob(["ok"]));
    await writable.close();
    await root.removeEntry("volti-probe");
    opfsAvailable = true;
  } catch {
    opfsAvailable = false;
  }
  return opfsAvailable;
}

async function scoreDirectory(
  id: string,
  create: boolean,
): Promise<FileSystemDirectoryHandle> {
  const root = await opfsRoot();
  const scores = await root.getDirectoryHandle("scores", { create });
  return scores.getDirectoryHandle(id, { create });
}

async function writeHandle(dir: FileSystemDirectoryHandle, name: string, data: Blob) {
  const handle = await dir.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  await writable.write(data);
  await writable.close();
}

async function readHandle(dir: FileSystemDirectoryHandle, name: string): Promise<Blob> {
  const handle = await dir.getFileHandle(name);
  return handle.getFile();
}

export async function writeOpfs(id: string, pdf: Blob, thumbnail: Blob): Promise<void> {
  const dir = await scoreDirectory(id, true);
  await writeHandle(dir, "score.pdf", pdf);
  await writeHandle(dir, "thumb.jpg", thumbnail);
}

export async function removeOpfs(id: string): Promise<void> {
  try {
    const root = await opfsRoot();
    const scores = await root.getDirectoryHandle("scores");
    await scores.removeEntry(id, { recursive: true });
  } catch {
    // Already gone, or OPFS is unavailable on this browser.
  }
}

export async function storeScoreBytes(
  id: string,
  pdf: Blob,
  thumbnail: Blob,
): Promise<ByteStore> {
  if (await canUseOpfs()) {
    try {
      await writeOpfs(id, pdf, thumbnail);
      return "opfs";
    } catch {
      await removeOpfs(id);
    }
  }
  await putBlobs({ id, pdf, thumbnail });
  return "idb";
}

export async function removeScoreBytes(score: ScoreRecord): Promise<void> {
  if (score.storage === "opfs") {
    await removeOpfs(score.id);
    return;
  }
  await deleteBlobs(score.id);
}

export async function readPdfBlob(score: ScoreRecord): Promise<Blob> {
  if (score.storage === "opfs") {
    const dir = await scoreDirectory(score.id, false);
    return readHandle(dir, "score.pdf");
  }
  const record = await getBlobs(score.id);
  if (!record) throw new Error("Missing PDF bytes.");
  return record.pdf;
}

export async function readThumbnailBlob(score: ScoreRecord): Promise<Blob> {
  if (score.storage === "opfs") {
    const dir = await scoreDirectory(score.id, false);
    return readHandle(dir, "thumb.jpg");
  }
  const record = await getBlobs(score.id);
  if (!record) throw new Error("Missing thumbnail.");
  return record.thumbnail;
}
