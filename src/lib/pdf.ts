import {
  getDocument,
  GlobalWorkerOptions,
  VerbosityLevel,
  type PDFDocumentLoadingTask,
  type PDFDocumentProxy,
  type RenderTask,
} from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc = workerUrl;

export const PIXEL_RATIO_CAP = 2;

export function cappedPixelRatio(): number {
  return Math.min(window.devicePixelRatio || 1, PIXEL_RATIO_CAP);
}

function bundledAsset(directory: string): string {
  const base = import.meta.env.BASE_URL;
  return `${base}${directory}/`;
}

export type OpenedPdf = {
  document: PDFDocumentProxy;
  close: () => Promise<void>;
};

export async function openPdf(bytes: Uint8Array): Promise<OpenedPdf> {
  const task: PDFDocumentLoadingTask = getDocument({
    data: bytes.slice(),
    cMapUrl: bundledAsset("cmaps"),
    cMapPacked: true,
    standardFontDataUrl: bundledAsset("standard_fonts"),
    wasmUrl: bundledAsset("wasm"),
    iccUrl: bundledAsset("iccs"),
    useSystemFonts: false,
    disableRange: true,
    disableStream: true,
    disableAutoFetch: true,
    verbosity: VerbosityLevel.ERRORS,
  });
  const document = await task.promise;
  return {
    document,
    close: () => task.destroy(),
  };
}

export function isPasswordError(error: unknown): boolean {
  return error instanceof Error && error.name === "PasswordException";
}

export function isRenderCancel(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "RenderingCancelledException" || error.name === "AbortError")
  );
}

function fitViewport(
  pageWidth: number,
  pageHeight: number,
  cssWidth: number,
  cssHeight: number,
  pixelRatio: number,
) {
  const fit = Math.min(cssWidth / pageWidth, cssHeight / pageHeight);
  return Math.max(fit, 0.01) * pixelRatio;
}

export type PageRender = {
  promise: Promise<ImageBitmap>;
  cancel: () => void;
};

function cancelledRender(): DOMException {
  return new DOMException("The page render was cancelled.", "AbortError");
}

export function startPageRender(
  pdf: PDFDocumentProxy,
  pageNumber: number,
  cssWidth: number,
  cssHeight: number,
  pixelRatio: number,
): PageRender {
  let cancelled = false;
  let task: RenderTask | null = null;
  const promise = (async () => {
    const page = await pdf.getPage(pageNumber);
    if (cancelled) {
      page.cleanup();
      throw cancelledRender();
    }
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({
      scale: fitViewport(base.width, base.height, cssWidth, cssHeight, pixelRatio),
    });
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    const context = canvas.getContext("2d");
    if (!context) {
      page.cleanup();
      throw new Error("Could not draw the page.");
    }
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    task = page.render({ canvas, viewport });
    if (cancelled) task.cancel();
    try {
      await task.promise;
    } finally {
      page.cleanup();
    }
    if (cancelled) throw cancelledRender();
    return createImageBitmap(canvas);
  })();
  return {
    promise,
    cancel() {
      cancelled = true;
      try {
        task?.cancel();
      } catch {
        // A finished render has nothing left to cancel.
      }
    },
  };
}

export async function renderThumbnail(pdf: PDFDocumentProxy): Promise<Blob> {
  const page = await pdf.getPage(1);
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: 280 / base.width });
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(viewport.width));
  canvas.height = Math.max(1, Math.ceil(viewport.height));
  const context = canvas.getContext("2d");
  if (!context) {
    page.cleanup();
    throw new Error("Could not draw the thumbnail.");
  }
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  try {
    await page.render({ canvas, viewport }).promise;
  } finally {
    page.cleanup();
  }
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Could not store the thumbnail."));
      },
      "image/jpeg",
      0.82,
    );
  });
}
