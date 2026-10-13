import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Dialog } from "./Dialog.tsx";
import {
  deleteScore,
  hasBeenOpened,
  importScore,
  listScores,
  renameScore,
} from "../lib/scores.ts";
import type { LibraryScore } from "../types.ts";

type LibraryScreenProps = {
  onOpen: (score: LibraryScore) => void;
};

function pageCountLabel(count: number): string {
  return count === 1 ? "1 page" : `${count} pages`;
}

export function LibraryScreen({ onOpen }: LibraryScreenProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const urlsRef = useRef<string[]>([]);
  const [scores, setScores] = useState<LibraryScore[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<LibraryScore | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LibraryScore | null>(null);

  const revokeUrls = useCallback(() => {
    for (const url of urlsRef.current) URL.revokeObjectURL(url);
    urlsRef.current = [];
  }, []);

  const remember = useCallback(
    (next: LibraryScore[]) => {
      revokeUrls();
      urlsRef.current = next.flatMap((score) =>
        score.thumbnailUrl ? [score.thumbnailUrl] : [],
      );
      setScores(next);
    },
    [revokeUrls],
  );

  const reload = useCallback(async () => {
    try {
      remember(await listScores());
      setLoadError(null);
    } catch {
      setLoadError("Volti couldn't open the library on this device.");
    } finally {
      setLoading(false);
    }
  }, [remember]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const next = await listScores();
        if (cancelled) {
          for (const score of next) {
            if (score.thumbnailUrl) URL.revokeObjectURL(score.thumbnailUrl);
          }
          return;
        }
        remember(next);
        setLoadError(null);
      } catch {
        if (!cancelled) setLoadError("Volti couldn't open the library on this device.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      revokeUrls();
    };
  }, [remember, revokeUrls]);

  async function onFiles(files: File[]) {
    setImporting(true);
    setImportError(null);
    const errors: string[] = [];
    for (const file of files) {
      try {
        await importScore(file);
      } catch (error) {
        errors.push(
          error instanceof Error
            ? error.message
            : `Volti couldn't read “${file.name}”. Choose a PDF.`,
        );
      }
    }
    setImporting(false);
    if (errors.length) setImportError(errors.join(" "));
    await reload();
  }

  const closeRename = useCallback(() => setRenameTarget(null), []);
  const closeDelete = useCallback(() => setDeleteTarget(null), []);

  async function saveRename(title: string) {
    if (!renameTarget) return;
    await renameScore(renameTarget.id, title);
    setScores((current) =>
      current.map((score) =>
        score.id === renameTarget.id ? { ...score, title: title.trim() } : score,
      ),
    );
    setRenameTarget(null);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    try {
      await deleteScore(target);
      if (target.thumbnailUrl) URL.revokeObjectURL(target.thumbnailUrl);
      urlsRef.current = urlsRef.current.filter((url) => url !== target.thumbnailUrl);
      setScores((current) => current.filter((score) => score.id !== target.id));
      setDeleteTarget(null);
    } catch {
      setImportError("Volti couldn't delete that score.");
      setDeleteTarget(null);
    }
  }

  const openPicker = () => inputRef.current?.click();

  return (
    <div className="flex h-dvh flex-col bg-black text-ink">
      <header className="flex items-center justify-between gap-4 border-b border-line pt-[max(1rem,env(safe-area-inset-top))] pb-4 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]">
        <div>
          <p className="font-serif text-2xl tracking-tight">Volti</p>
          <p className="text-sm text-muted">Scores stay on this device.</p>
        </div>
        {scores.length > 0 && (
          <button
            type="button"
            className="rounded-full bg-brass px-4 py-2 text-sm font-medium text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brass disabled:opacity-60"
            onClick={openPicker}
            disabled={importing}
          >
            {importing ? "Reading…" : "Import PDF"}
          </button>
        )}
      </header>

      <input
        ref={inputRef}
        data-testid="import-input"
        className="sr-only"
        type="file"
        accept="application/pdf"
        multiple
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          if (files.length) void onFiles(files);
        }}
      />

      <main className="flex-1 overflow-y-auto pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]">
        {importError && (
          <p
            data-testid="library-error"
            role="alert"
            className="mb-4 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger"
          >
            {importError}
          </p>
        )}

        {loading && (
          <p role="status" className="py-16 text-center text-muted">
            Loading your scores…
          </p>
        )}

        {!loading && loadError && (
          <div className="mx-auto max-w-md py-16 text-center">
            <p role="alert" className="text-lg">
              {loadError}
            </p>
            <button
              type="button"
              className="mt-6 rounded-full border border-line px-4 py-2 text-sm"
              onClick={() => void reload()}
            >
              Try again
            </button>
          </div>
        )}

        {!loading && !loadError && scores.length === 0 && (
          <div
            data-testid="empty-library"
            className="mx-auto flex min-h-[60dvh] max-w-md flex-col items-center justify-center text-center"
          >
            <p className="font-serif text-4xl text-ink">The stand is empty.</p>
            <p className="mt-3 text-base text-muted">
              Import a PDF score. Volti keeps it on this device and opens one page at a
              time.
            </p>
            <button
              type="button"
              className="mt-8 rounded-full bg-brass px-5 py-3 text-sm font-medium text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brass disabled:opacity-60"
              onClick={openPicker}
              disabled={importing}
            >
              {importing ? "Reading the PDF…" : "Import a PDF"}
            </button>
          </div>
        )}

        {!loading && !loadError && scores.length > 0 && (
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {scores.map((score) => (
              <li key={score.id}>
                <article
                  data-testid="score-card"
                  className="overflow-hidden rounded-2xl border border-line bg-panel"
                >
                  <button
                    type="button"
                    data-testid="open-score"
                    className="flex w-full gap-3 p-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brass md:flex-col"
                    onClick={() => onOpen(score)}
                  >
                    {score.thumbnailUrl ? (
                      <span className="flex h-28 w-20 shrink-0 items-center justify-center bg-black md:h-80 md:w-full">
                        <img
                          src={score.thumbnailUrl}
                          alt=""
                          className="max-h-full max-w-full object-contain"
                        />
                      </span>
                    ) : (
                      <span className="grid h-28 w-20 shrink-0 place-items-center bg-black text-xs text-muted md:h-80 md:w-full">
                        No preview
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span
                        data-testid="score-title"
                        className="block truncate font-serif text-xl"
                      >
                        {score.title}
                      </span>
                      <span className="mt-1 block text-sm text-muted">
                        {pageCountLabel(score.pageCount)}
                      </span>
                      {hasBeenOpened(score) && (
                        <span className="mt-1 block text-sm text-brass">
                          Resume page {score.lastPage}
                        </span>
                      )}
                    </span>
                  </button>
                  <div className="grid grid-cols-2 border-t border-line">
                    <button
                      type="button"
                      data-testid="rename-score"
                      className="px-3 py-3 text-sm text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brass"
                      onClick={() => setRenameTarget(score)}
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      data-testid="delete-score"
                      className="border-l border-line px-3 py-3 text-sm text-danger focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brass"
                      onClick={() => setDeleteTarget(score)}
                    >
                      Delete
                    </button>
                  </div>
                </article>
              </li>
            ))}
          </ul>
        )}
      </main>

      {renameTarget && (
        <RenameDialog score={renameTarget} onClose={closeRename} onSave={saveRename} />
      )}
      {deleteTarget && (
        <Dialog title="Delete this score?" onClose={closeDelete}>
          <p className="text-sm leading-6 text-muted">
            Volti removes “{deleteTarget.title}” from this device. The original file is
            left alone.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              className="rounded-full px-4 py-2 text-sm text-ink"
              onClick={closeDelete}
            >
              Cancel
            </button>
            <button
              type="button"
              data-testid="confirm-delete"
              className="rounded-full bg-danger px-4 py-2 text-sm font-medium text-black"
              onClick={() => void confirmDelete()}
            >
              Delete
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}

function RenameDialog({
  score,
  onClose,
  onSave,
}: {
  score: LibraryScore;
  onClose: () => void;
  onSave: (title: string) => Promise<void>;
}) {
  const [title, setTitle] = useState(score.title);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) {
      setError("Give the score a name.");
      return;
    }
    await onSave(title);
  }

  return (
    <Dialog title="Rename score" onClose={onClose}>
      <form onSubmit={(event) => void onSubmit(event)}>
        <label htmlFor="score-title" className="text-sm text-muted">
          Title
        </label>
        <input
          id="score-title"
          data-testid="rename-input"
          value={title}
          autoComplete="off"
          onChange={(event) => {
            setTitle(event.target.value);
            setError(null);
          }}
          className="mt-2 w-full rounded-xl border border-line bg-black px-3 py-3 text-ink outline-none focus:border-brass"
        />
        {error && (
          <p role="alert" className="mt-2 text-sm text-danger">
            {error}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="rounded-full px-4 py-2 text-sm" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className="rounded-full bg-brass px-4 py-2 text-sm font-medium text-black"
          >
            Save
          </button>
        </div>
      </form>
    </Dialog>
  );
}
