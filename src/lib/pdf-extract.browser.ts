// Client-side PDF text extraction using pdfjs-dist (legacy build for stable worker setup).
// Lazy-loaded so the dashboard shell isn't blocked by ~1MB of PDF.js on first paint.

export class CancelledError extends Error {
  constructor() {
    super("Cancelled");
    this.name = "CancelledError";
  }
}

let pdfjsPromise: Promise<typeof import("pdfjs-dist/legacy/build/pdf.mjs")> | null = null;
export async function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const [lib, worker] = await Promise.all([
        import("pdfjs-dist/legacy/build/pdf.mjs"),
        import("pdfjs-dist/legacy/build/pdf.worker.mjs?url"),
      ]);
      lib.GlobalWorkerOptions.workerSrc = worker.default;
      return lib;
    })();
  }
  return pdfjsPromise;
}

let ocrWorker: Promise<any> | null = null;
async function getOcrWorker() {
  if (!ocrWorker) {
    ocrWorker = (async () => {
      const { createWorker } = await import("tesseract.js");
      return createWorker("eng");
    })();
  }
  return ocrWorker;
}

export async function terminateOcr() {
  if (!ocrWorker) return;
  try {
    const w = await ocrWorker;
    await w.terminate();
  } catch {
    /* noop */
  }
  ocrWorker = null;
}

/** Render a PDF page to a canvas and OCR it (used for scanned / image-only PDFs). */
async function ocrPage(page: any): Promise<string> {
  const viewport = page.getViewport({ scale: 2 });
  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  await page.render({ canvasContext: ctx, viewport, canvas }).promise;
  const worker = await getOcrWorker();
  const { data } = await worker.recognize(canvas);
  canvas.width = 0;
  canvas.height = 0;
  return (data?.text ?? "").trim();
}

export async function extractPdfPages(
  file: File,
  onProgress?: (done: number, total: number) => void,
  shouldCancel?: () => boolean,
  onStage?: (stage: string) => void,
): Promise<{ page: number; text: string }[]> {
  const pdfjsLib = await loadPdfjs();
  const buf = await file.arrayBuffer();
  if (shouldCancel?.()) throw new CancelledError();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const total = pdf.numPages;
  const pages: { page: number; text: string }[] = [];
  let ocrUsed = false;
  for (let i = 1; i <= total; i++) {
    if (shouldCancel?.()) throw new CancelledError();
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    let text = content.items
      .map((it: unknown) => {
        const item = it as { str?: string };
        return item.str ?? "";
      })
      .join(" ")
      .trim();

    // Scanned page fallback: almost no embedded text -> run OCR on a rendered canvas.
    if (text.replace(/\s+/g, "").length < 24) {
      try {
        if (!ocrUsed) onStage?.("Scanned PDF detected — running OCR…");
        ocrUsed = true;
        text = await ocrPage(page);
      } catch {
        /* OCR is best-effort */
      }
    }

    pages.push({ page: i, text });
    onProgress?.(i, total);
  }
  if (ocrUsed) await terminateOcr();
  return pages;
}

