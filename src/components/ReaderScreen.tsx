import { useEffect, useRef, useState } from "react";
import {
  cappedPixelRatio,
  isRenderCancel,
  openPdf,
  startPageRender,
  type OpenedPdf,
  type PageRender,
} from "../lib/pdf.ts";
import { markOpened, readPdfBytes, saveLastPage } from "../lib/scores.ts";
import { useHandsFree, type HandsFreeStatus } from "../lib/useHandsFree.ts";
import { useWakeLock } from "../lib/useWakeLock.ts";
import type { ScoreRecord } from "../types.ts";

type ReaderScreenProps = {
  score: ScoreRecord;
  onClose: () => void;
};

type CachedPage = {
  key: string;
  bitmap: ImageBitmap;
};

type Box = {
  width: number;
  height: number;
};

function cacheKey(pageNumber: number, box: Box, pixelRatio: number): string {
  return `${pageNumber}:${Math.round(box.width)}x${Math.round(box.height)}@${pixelRatio}`;
}

function handsFreeLabel(
  status: HandsFreeStatus,
  faceSeen: boolean,
  notice: string | null,
): string | null {
  if (notice) return notice;
  if (status === "starting") return "Starting the camera…";
  if (status === "calibrating") return faceSeen ? "Look at the page." : "Can't see you";
  if (status === "lost") return "Can't see you";
  if (status === "on") return "Camera on";
  return null;
}

function contentBox(element: HTMLElement): Box {
  const styles = getComputedStyle(element);
  const padX = Number.parseFloat(styles.paddingLeft) + Number.parseFloat(styles.paddingRight);
  const padY = Number.parseFloat(styles.paddingTop) + Number.parseFloat(styles.paddingBottom);
  return {
    width: Math.max(0, element.clientWidth - padX),
    height: Math.max(0, element.clientHeight - padY),
  };
}

export function ReaderScreen({ score, onClose }: ReaderScreenProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const pdfRef = useRef<OpenedPdf | null>(null);
  const cacheRef = useRef<Map<number, CachedPage>>(new Map());
  const jobsRef = useRef<PageRender[]>([]);
  const pageRef = useRef(score.lastPage);
  const pageCountRef = useRef(score.pageCount);
  const hasFrameRef = useRef(false);
  const gestureRef = useRef<{ id: number; x: number; y: number } | null>(null);
  const onCloseRef = useRef(onClose);

  const [page, setPage] = useState(() => Math.max(1, score.lastPage));
  const [pageCount, setPageCount] = useState(score.pageCount);
  const [ready, setReady] = useState(false);
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [chromeOn, setChromeOn] = useState(true);
  const [turning, setTurning] = useState(false);
  const [box, setBox] = useState<Box>({ width: 0, height: 0 });

  useEffect(() => {
    pageRef.current = page;
    pageCountRef.current = pageCount;
    onCloseRef.current = onClose;
  });

  useWakeLock(phase !== "error");

  const hands = useHandsFree((direction) => {
    setPage((current) => {
      const count = pageCountRef.current;
      const delta = direction === "next" ? 1 : -1;
      return Math.min(count, Math.max(1, current + delta));
    });
  });
  const handsLabel =
    !hands.enabled && !hands.notice
      ? null
      : handsFreeLabel(hands.status, hands.faceSeen, hands.notice);
  const showConfirm = hands.status === "calibrating" && hands.faceSeen && !hands.notice;

  useEffect(() => {
    const previousTitle = document.title;
    document.title = `${score.title} — Volti`;
    return () => {
      document.title = previousTitle;
    };
  }, [score.title]);

  useEffect(() => {
    void markOpened(score.id);
  }, [score.id]);

  useEffect(() => {
    const flush = () => {
      void saveLastPage(score.id, pageRef.current);
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [score.id]);

  useEffect(() => {
    if (!ready) return;
    void saveLastPage(score.id, page);
  }, [ready, score.id, page]);

  useEffect(() => {
    let cancelled = false;
    let openedLocal: OpenedPdf | null = null;
    const jobs = jobsRef.current;
    const cache = cacheRef.current;
    hasFrameRef.current = false;

    void (async () => {
      try {
        const bytes = await readPdfBytes(score);
        if (cancelled) return;
        const opened = await openPdf(bytes);
        if (cancelled) {
          await opened.close();
          return;
        }
        openedLocal = opened;
        pdfRef.current = opened;
        const count = opened.document.numPages;
        const start = Math.min(Math.max(1, score.lastPage), count);
        setPageCount(count);
        setPage(start);
        setReady(true);
      } catch {
        if (!cancelled) {
          setPhase("error");
          setError(
            "Volti couldn't open this score from device storage. Delete it and import the PDF again.",
          );
        }
      }
    })();

    return () => {
      cancelled = true;
      pdfRef.current = null;
      if (openedLocal) void openedLocal.close();
      for (const job of jobs) job.cancel();
      jobs.length = 0;
      for (const entry of cache.values()) entry.bitmap.close();
      cache.clear();
    };
  }, [score]);

  useEffect(() => {
    const element = stageRef.current;
    if (!element) return;
    const measure = () => {
      const next = contentBox(element);
      const width = Math.round(next.width);
      const height = Math.round(next.height);
      setBox((current) =>
        current.width === width && current.height === height ? current : { width, height },
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  useEffect(() => {
    if (!chromeOn) return;
    if (hands.status === "calibrating" || hands.status === "starting") return;
    const timer = window.setTimeout(() => setChromeOn(false), 3200);
    return () => window.clearTimeout(timer);
  }, [chromeOn, page, hands.status]);

  useEffect(() => {
    const opened = pdfRef.current;
    if (!ready || !opened || box.width < 2 || box.height < 2) return;
    const pdf = opened.document;
    const pixelRatio = cappedPixelRatio();
    let cancelled = false;
    const slowTimer = window.setTimeout(() => {
      if (!cancelled && !cacheRef.current.get(page)) setTurning(true);
    }, 400);

    const jobs = jobsRef.current;
    const cancelJobs = () => {
      for (const job of jobs) job.cancel();
      jobs.length = 0;
    };

    const draw = (bitmap: ImageBitmap) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      canvas.style.width = `${bitmap.width / pixelRatio}px`;
      canvas.style.height = `${bitmap.height / pixelRatio}px`;
      const context = canvas.getContext("2d");
      if (!context) return;
      context.drawImage(bitmap, 0, 0);
      hasFrameRef.current = true;
    };

    const remember = (pageNumber: number, key: string, bitmap: ImageBitmap) => {
      const previous = cacheRef.current.get(pageNumber);
      if (previous && previous.key !== key) previous.bitmap.close();
      if (previous?.key === key && previous.bitmap !== bitmap) bitmap.close();
      if (previous?.key !== key) cacheRef.current.set(pageNumber, { key, bitmap });
    };

    const renderIntoCache = async (pageNumber: number) => {
      if (pageNumber < 1 || pageNumber > pdf.numPages) return;
      const key = cacheKey(pageNumber, box, pixelRatio);
      const existing = cacheRef.current.get(pageNumber);
      if (existing?.key === key) return;
      const job = startPageRender(pdf, pageNumber, box.width, box.height, pixelRatio);
      jobsRef.current.push(job);
      try {
        const bitmap = await job.promise;
        if (cancelled) {
          bitmap.close();
          return;
        }
        remember(pageNumber, key, bitmap);
      } catch (renderError) {
        if (!isRenderCancel(renderError) && pageNumber === page && !hasFrameRef.current) {
          setPhase("error");
          setError("This page didn't draw. Close the score and open it again.");
        }
      }
    };

    const trim = (current: number) => {
      for (const [pageNumber, entry] of cacheRef.current) {
        if (Math.abs(pageNumber - current) > 1) {
          entry.bitmap.close();
          cacheRef.current.delete(pageNumber);
        }
      }
    };

    void (async () => {
      const key = cacheKey(page, box, pixelRatio);
      const cached = cacheRef.current.get(page);
      if (cached?.key === key) {
        draw(cached.bitmap);
        setPhase("ready");
        setTurning(false);
      } else {
        await renderIntoCache(page);
        if (cancelled) return;
        const fresh = cacheRef.current.get(page);
        if (fresh?.key === key) {
          draw(fresh.bitmap);
          setPhase("ready");
          setTurning(false);
        }
      }
      if (cancelled) return;
      await renderIntoCache(page + 1);
      if (cancelled) return;
      await renderIntoCache(page - 1);
      trim(page);
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(slowTimer);
      setTurning(false);
      cancelJobs();
    };
  }, [ready, page, box]);

  function turn(delta: number) {
    setPage((current) => {
      const count = pageCountRef.current;
      return Math.min(count, Math.max(1, current + delta));
    });
  }

  useEffect(() => {
    const step = (delta: number) => {
      setPage((current) => {
        const count = pageCountRef.current;
        return Math.min(count, Math.max(1, current + delta));
      });
      setChromeOn(true);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight" || event.key === "PageDown") {
        event.preventDefault();
        step(1);
      } else if (event.key === "ArrowLeft" || event.key === "PageUp") {
        event.preventDefault();
        step(-1);
      } else if (event.key === "Escape") {
        event.preventDefault();
        void saveLastPage(score.id, pageRef.current).then(() => onCloseRef.current());
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [score.id]);

  async function closeReader() {
    await saveLastPage(score.id, pageRef.current);
    onClose();
  }

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (gestureRef.current || event.button !== 0) return;
    gestureRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    const start = gestureRef.current;
    if (!start || start.id !== event.pointerId) return;
    gestureRef.current = null;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) >= 48 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      turn(dx < 0 ? 1 : -1);
      return;
    }
    if (Math.abs(dx) < 12 && Math.abs(dy) < 12) {
      const rect = event.currentTarget.getBoundingClientRect();
      const zone = (event.clientX - rect.left) / rect.width;
      if (zone < 0.3) turn(-1);
      else if (zone > 0.7) turn(1);
      else setChromeOn((on) => !on);
    }
  }

  return (
    <div className="fixed inset-0 bg-black text-ink select-none" aria-busy={phase === "loading"}>
      <div
        ref={stageRef}
        className="absolute inset-0 flex items-center justify-center pt-[max(0.75rem,env(safe-area-inset-top))] pr-[max(0.75rem,env(safe-area-inset-right))] pb-[max(0.75rem,env(safe-area-inset-bottom))] pl-[max(0.75rem,env(safe-area-inset-left))]"
      >
        <canvas ref={canvasRef} className="bg-white shadow-none" />
      </div>

      {phase !== "error" && (
        <div
          data-testid="reader-stage"
          className="absolute inset-0 touch-none"
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={() => {
            gestureRef.current = null;
          }}
          onContextMenu={(event) => event.preventDefault()}
        />
      )}

      {phase === "loading" && (
        <p className="pointer-events-none absolute inset-x-0 bottom-24 text-center text-sm text-muted">
          Opening the page…
        </p>
      )}
      {turning && phase === "ready" && (
        <p className="pointer-events-none absolute inset-x-0 bottom-24 text-center text-sm text-muted">
          Turning the page…
        </p>
      )}

      {phase !== "error" && (
        <div
          className={`pointer-events-none absolute inset-0 flex flex-col justify-between transition-opacity duration-300 ${chromeOn ? "opacity-100" : "opacity-0"}`}
          aria-hidden={!chromeOn}
        >
          <div className="flex items-center gap-3 bg-gradient-to-b from-black via-black/80 to-transparent px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-10 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]">
            <button
              type="button"
              data-testid="close-reader"
              className={`rounded-full border border-white/20 px-4 py-2 text-sm ${chromeOn ? "pointer-events-auto" : "pointer-events-none"}`}
              onClick={() => void closeReader()}
            >
              Close
            </button>
            <h1 className="min-w-0 flex-1 truncate text-center font-serif text-lg">
              {score.title}
            </h1>
            {hands.supported ? (
              <button
                type="button"
                data-testid="hands-free-toggle"
                aria-pressed={hands.enabled}
                className={`shrink-0 rounded-full border px-3 py-2 text-sm ${hands.enabled ? "border-brass bg-brass text-black" : "border-white/20 text-ink"} ${chromeOn ? "pointer-events-auto" : "pointer-events-none"}`}
                onClick={() => {
                  hands.toggle();
                  setChromeOn(true);
                }}
              >
                Hands-free
              </button>
            ) : (
              <span className="w-16 shrink-0" />
            )}
          </div>
          <div className="bg-gradient-to-t from-black via-black/80 to-transparent px-4 pt-10 pb-[max(0.85rem,env(safe-area-inset-bottom))] text-center">
            <div className="flex items-center justify-center gap-4">
              <p
                data-testid="page-indicator"
                aria-label={`Page ${page} of ${pageCount}`}
                className="text-sm tracking-[0.2em] tabular-nums text-ink"
              >
                {page} / {pageCount}
              </p>
              {hands.canRecalibrate && (
                <button
                  type="button"
                  data-testid="recalibrate"
                  className={`rounded-full border border-white/20 px-3 py-1.5 text-xs text-ink ${chromeOn ? "pointer-events-auto" : "pointer-events-none"}`}
                  onClick={() => {
                    hands.recalibrate();
                    setChromeOn(true);
                  }}
                >
                  Recalibrate
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {phase !== "error" && handsLabel && (
        <div className="pointer-events-none absolute inset-x-0 bottom-[max(4.75rem,calc(env(safe-area-inset-bottom)+3.5rem))] z-10 flex justify-center px-4">
          <div className="flex max-w-xs items-center gap-2 rounded-full bg-black/75 px-3 py-1.5 text-center text-xs text-ink">
            <p data-testid="hands-free-status">{handsLabel}</p>
            {showConfirm && (
              <button
                type="button"
                data-testid="confirm-center"
                className="pointer-events-auto rounded-full bg-brass px-3 py-1 text-xs font-medium text-black"
                onClick={() => hands.confirmCenter()}
              >
                Confirm
              </button>
            )}
          </div>
        </div>
      )}

      {phase === "error" && error && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black px-6">
          <div className="max-w-sm text-center">
            <p role="alert" className="text-lg leading-7">
              {error}
            </p>
            <button
              type="button"
              className="mt-6 rounded-full bg-brass px-4 py-2 text-sm font-medium text-black"
              onClick={() => void closeReader()}
            >
              Back to the library
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
