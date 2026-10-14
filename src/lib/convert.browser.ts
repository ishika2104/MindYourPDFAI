// Client-side file conversion helpers. Everything runs in the browser —
// no uploads, no server round-trip.

export type TargetFormat = "pdf" | "docx" | "txt" | "md" | "html" | "png";

export type SourceKind = "pdf" | "docx" | "text" | "image";

export function detectKind(file: File): SourceKind | null {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) return "pdf";
  if (name.endsWith(".docx")) return "docx";
  if (/\.(txt|md|markdown|csv|json|log)$/.test(name)) return "text";
  if (/\.(png|jpg|jpeg)$/.test(name)) return "image";
  return null;
}

export const TARGETS: Record<SourceKind, { id: TargetFormat; label: string }[]> = {
  pdf: [
    { id: "docx", label: "Word (.docx)" },
    { id: "txt", label: "Plain text (.txt)" },
    { id: "md", label: "Markdown (.md)" },
    { id: "html", label: "Web page (.html)" },
    { id: "png", label: "Images (.png per page)" },
  ],
  docx: [
    { id: "pdf", label: "PDF (.pdf)" },
    { id: "txt", label: "Plain text (.txt)" },
    { id: "md", label: "Markdown (.md)" },
    { id: "html", label: "Web page (.html)" },
  ],
  text: [
    { id: "pdf", label: "PDF (.pdf)" },
    { id: "docx", label: "Word (.docx)" },
    { id: "html", label: "Web page (.html)" },
  ],
  image: [{ id: "pdf", label: "PDF (.pdf)" }],
};

export type ConvertResult = { name: string; blob: Blob }[];

const baseName = (n: string) => n.replace(/\.[^.]+$/, "");

function escapeHtml(s: string) {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] as string);
}

function wrapHtml(title: string, body: string) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>body{font-family:system-ui,sans-serif;max-width:44rem;margin:3rem auto;padding:0 1.25rem;line-height:1.7;color:#0f172a}h1,h2{line-height:1.25}</style></head><body>${body}</body></html>`;
}

/** PDF -> array of page texts. */
async function pdfPages(file: File, onProgress?: (d: number, t: number) => void) {
  const { extractPdfPages } = await import("./pdf-extract.browser");
  const pages = await extractPdfPages(file, onProgress);
  return pages.map((p) => p.text);
}

async function textToPdf(text: string): Promise<Blob> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const size = 11;
  const margin = 56;
  const pageW = 595.28;
  const pageH = 841.89;
  const maxW = pageW - margin * 2;

  const lines: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    // strip characters WinAnsi can't encode
    const paragraph = raw.replace(/[^\x09\x0A\x0D\x20-\x7E\u00A0-\u00FF]/g, "");
    if (!paragraph.trim()) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) > maxW) {
        if (line) lines.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    if (line) lines.push(line);
  }

  let page = doc.addPage([pageW, pageH]);
  let y = pageH - margin;
  for (const line of lines) {
    if (y < margin) {
      page = doc.addPage([pageW, pageH]);
      y = pageH - margin;
    }
    if (line) page.drawText(line, { x: margin, y, size, font, color: rgb(0.06, 0.09, 0.16) });
    y -= size * 1.55;
  }
  const bytes = await doc.save();
  return new Blob([bytes as unknown as BlobPart], { type: "application/pdf" });
}

async function textToDocx(text: string): Promise<Blob> {
  const { Document, Packer, Paragraph, TextRun } = await import("docx");
  const doc = new Document({
    sections: [
      {
        children: text.split(/\r?\n/).map(
          (line) => new Paragraph({ children: [new TextRun({ text: line, font: "Arial", size: 22 })] }),
        ),
      },
    ],
  });
  const blob = await Packer.toBlob(doc);
  return blob;
}

async function pagesToDocx(pages: string[]): Promise<Blob> {
  const { Document, Packer, Paragraph, TextRun, PageBreak, HeadingLevel } = await import("docx");
  const children: InstanceType<typeof Paragraph>[] = [];
  pages.forEach((text, i) => {
    if (i > 0) children.push(new Paragraph({ children: [new PageBreak()] }));
    children.push(
      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: `Page ${i + 1}` })] }),
    );
    for (const line of text.split(/\r?\n/)) {
      children.push(new Paragraph({ children: [new TextRun({ text: line, font: "Arial", size: 22 })] }));
    }
  });
  const doc = new Document({ sections: [{ children }] });
  return Packer.toBlob(doc);
}

async function imagesToPdf(files: File[]): Promise<Blob> {
  const { PDFDocument } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  for (const f of files) {
    const bytes = new Uint8Array(await f.arrayBuffer());
    const img = /\.png$/i.test(f.name) ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
    const page = doc.addPage([img.width, img.height]);
    page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
  }
  const out = await doc.save();
  return new Blob([out as unknown as BlobPart], { type: "application/pdf" });
}

async function pdfToPngs(file: File, onProgress?: (d: number, t: number) => void): Promise<ConvertResult> {
  const { loadPdfjs } = await import("./pdf-extract.browser");
  const pdfjsLib = await loadPdfjs();
  const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
  const out: ConvertResult = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext("2d")!;
    await page.render({ canvas, canvasContext: ctx, viewport } as never).promise;
    const blob: Blob = await new Promise((res) => canvas.toBlob((b) => res(b!), "image/png"));
    out.push({ name: `${baseName(file.name)}-page-${i}.png`, blob });
    onProgress?.(i, pdf.numPages);
  }
  return out;
}

const txt = (s: string) => new Blob([s], { type: "text/plain;charset=utf-8" });

export async function convertFiles(
  files: File[],
  kind: SourceKind,
  target: TargetFormat,
  onProgress?: (done: number, total: number) => void,
): Promise<ConvertResult> {
  if (kind === "image") {
    return [{ name: `${baseName(files[0].name)}.pdf`, blob: await imagesToPdf(files) }];
  }

  const results: ConvertResult = [];
  for (const file of files) {
    const stem = baseName(file.name);

    if (kind === "pdf") {
      if (target === "png") {
        results.push(...(await pdfToPngs(file, onProgress)));
        continue;
      }
      const pages = await pdfPages(file, onProgress);
      if (target === "docx") {
        results.push({ name: `${stem}.docx`, blob: await pagesToDocx(pages) });
      } else if (target === "md") {
        const md = pages.map((p, i) => `## Page ${i + 1}\n\n${p.trim()}`).join("\n\n---\n\n");
        results.push({ name: `${stem}.md`, blob: txt(md) });
      } else if (target === "html") {
        const body = pages
          .map((p, i) => `<h2>Page ${i + 1}</h2><p>${escapeHtml(p.trim()).replace(/\n/g, "<br>")}</p>`)
          .join("\n");
        results.push({ name: `${stem}.html`, blob: new Blob([wrapHtml(stem, body)], { type: "text/html" }) });
      } else {
        const plain = pages.map((p, i) => `--- Page ${i + 1} ---\n${p.trim()}`).join("\n\n");
        results.push({ name: `${stem}.txt`, blob: txt(plain) });
      }
      continue;
    }

    if (kind === "docx") {
      const mammoth = await import("mammoth/mammoth.browser");
      const buf = await file.arrayBuffer();
      if (target === "html") {
        const { value } = await mammoth.convertToHtml({ arrayBuffer: buf });
        results.push({ name: `${stem}.html`, blob: new Blob([wrapHtml(stem, value)], { type: "text/html" }) });
      } else {
        const { value } = await mammoth.extractRawText({ arrayBuffer: buf });
        if (target === "pdf") results.push({ name: `${stem}.pdf`, blob: await textToPdf(value) });
        else results.push({ name: `${stem}.${target}`, blob: txt(value) });
      }
      onProgress?.(1, 1);
      continue;
    }

    // plain text / markdown source
    const content = await file.text();
    if (target === "pdf") results.push({ name: `${stem}.pdf`, blob: await textToPdf(content) });
    else if (target === "docx") results.push({ name: `${stem}.docx`, blob: await textToDocx(content) });
    else {
      const body = `<pre style="white-space:pre-wrap">${escapeHtml(content)}</pre>`;
      results.push({ name: `${stem}.html`, blob: new Blob([wrapHtml(stem, body)], { type: "text/html" }) });
    }
    onProgress?.(1, 1);
  }
  return results;
}

export function downloadBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
