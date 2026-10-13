import type { BlobRecord, ScoreRecord } from "../types.ts";

const DB_NAME = "volti";
const DB_VERSION = 1;

let databasePromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (!databasePromise) {
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains("scores")) {
          database.createObjectStore("scores", { keyPath: "id" });
        }
        if (!database.objectStoreNames.contains("blobs")) {
          database.createObjectStore("blobs", { keyPath: "id" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        databasePromise = null;
        reject(request.error ?? new Error("Could not open the library."));
      };
    });
  }
  return databasePromise;
}

function finish(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export async function putScore(score: ScoreRecord): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction("scores", "readwrite");
  transaction.objectStore("scores").put(score);
  await finish(transaction);
}

export async function getScore(id: string): Promise<ScoreRecord | null> {
  const database = await openDatabase();
  const transaction = database.transaction("scores", "readonly");
  const request = transaction.objectStore("scores").get(id);
  const result = await new Promise<ScoreRecord | undefined>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result as ScoreRecord | undefined);
    request.onerror = () => reject(request.error);
  });
  await finish(transaction);
  return result ?? null;
}

export async function getAllScores(): Promise<ScoreRecord[]> {
  const database = await openDatabase();
  const transaction = database.transaction("scores", "readonly");
  const request = transaction.objectStore("scores").getAll();
  const result = await new Promise<ScoreRecord[]>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result as ScoreRecord[]);
    request.onerror = () => reject(request.error);
  });
  await finish(transaction);
  return result;
}

export async function deleteScoreMeta(id: string): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction("scores", "readwrite");
  transaction.objectStore("scores").delete(id);
  await finish(transaction);
}

export async function putBlobs(record: BlobRecord): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction("blobs", "readwrite");
  transaction.objectStore("blobs").put(record);
  await finish(transaction);
}

export async function getBlobs(id: string): Promise<BlobRecord | null> {
  const database = await openDatabase();
  const transaction = database.transaction("blobs", "readonly");
  const request = transaction.objectStore("blobs").get(id);
  const result = await new Promise<BlobRecord | undefined>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result as BlobRecord | undefined);
    request.onerror = () => reject(request.error);
  });
  await finish(transaction);
  return result ?? null;
}

export async function deleteBlobs(id: string): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction("blobs", "readwrite");
  transaction.objectStore("blobs").delete(id);
  await finish(transaction);
}
