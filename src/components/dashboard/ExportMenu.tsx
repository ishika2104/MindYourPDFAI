import { Download, FileJson, FileText as FileTextIcon, FileType, FileText, File as FileIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

export interface ExportData {
  title: string;
  chat: { role: string; text: string }[];
  summaries?: Record<string, string>;
  insights?: unknown;
}

function downloadBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function download(name: string, content: string, mime: string) {
  downloadBlob(name, new Blob([content], { type: mime }));
}

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "document";
}

function buildMarkdown(d: ExportData): string {
  const parts: string[] = [`# ${d.title}\n`];
  if (d.summaries && Object.keys(d.summaries).length > 0) {
    parts.push("## Summaries\n");
    for (const [kind, text] of Object.entries(d.summaries)) {
      parts.push(`### ${kind}\n\n${text}\n`);
    }
  }
  if (d.insights) {
    parts.push("## Insights\n\n```json\n" + JSON.stringify(d.insights, null, 2) + "\n```\n");
  }
  if (d.chat.length > 0) {
    parts.push("## Chat transcript\n");
    for (const m of d.chat) {
      parts.push(`**${m.role === "user" ? "You" : "AI"}:**\n\n${m.text}\n`);
    }
  }
  return parts.join("\n");
}

function buildText(d: ExportData): string {
  return buildMarkdown(d).replace(/[#*`]/g, "");
}

async function exportDocx(d: ExportData, filename: string) {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import("docx");
  const children: InstanceType<typeof Paragraph>[] = [
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(d.title)] }),
  ];
  if (d.summaries && Object.keys(d.summaries).length > 0) {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Summaries")] }));
    for (const [kind, text] of Object.entries(d.summaries)) {
      children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(kind)] }));
      for (const line of text.split(/\n+/)) {
        children.push(new Paragraph({ children: [new TextRun(line)] }));
      }
    }
  }
  if (d.insights) {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Insights")] }));
    children.push(new Paragraph({ children: [new TextRun(JSON.stringify(d.insights, null, 2))] }));
  }
  if (d.chat.length > 0) {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Chat transcript")] }));
    for (const m of d.chat) {
      children.push(new Paragraph({
        children: [new TextRun({ text: m.role === "user" ? "You:" : "AI:", bold: true })],
      }));
      for (const line of m.text.split(/\n+/)) {
        children.push(new Paragraph({ children: [new TextRun(line)] }));
      }
    }
  }
  const doc = new Document({ sections: [{ children }] });
  const blob = await Packer.toBlob(doc);
  downloadBlob(filename, blob);
}

async function exportPdf(d: ExportData, filename: string) {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pageSize: [number, number] = [612, 792];
  const margin = 54;
  const maxWidth = pageSize[0] - margin * 2;
  let page = pdf.addPage(pageSize);
  let y = pageSize[1] - margin;

  function wrap(text: string, size: number, f: typeof font): string[] {
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let current = "";
    for (const w of words) {
      const test = current ? `${current} ${w}` : w;
      if (f.widthOfTextAtSize(test, size) > maxWidth) {
        if (current) lines.push(current);
        current = w;
      } else current = test;
    }
    if (current) lines.push(current);
    return lines;
  }

  function write(text: string, opts: { size?: number; bold?: boolean; gap?: number } = {}) {
    const size = opts.size ?? 11;
    const f = opts.bold ? bold : font;
    const lineHeight = size * 1.35;
    for (const paragraph of text.split(/\n/)) {
      const lines = paragraph ? wrap(paragraph, size, f) : [""];
      for (const line of lines) {
        if (y - lineHeight < margin) {
          page = pdf.addPage(pageSize);
          y = pageSize[1] - margin;
        }
        page.drawText(line.replace(/[^\x20-\x7E]/g, ""), { x: margin, y: y - lineHeight, size, font: f, color: rgb(0.1, 0.1, 0.15) });
        y -= lineHeight;
      }
    }
    y -= opts.gap ?? 6;
  }

  write(d.title, { size: 20, bold: true, gap: 12 });
  if (d.summaries && Object.keys(d.summaries).length > 0) {
    write("Summaries", { size: 15, bold: true, gap: 8 });
    for (const [kind, text] of Object.entries(d.summaries)) {
      write(kind, { size: 12, bold: true, gap: 4 });
      write(text, { gap: 10 });
    }
  }
  if (d.insights) {
    write("Insights", { size: 15, bold: true, gap: 8 });
    write(JSON.stringify(d.insights, null, 2), { size: 9, gap: 10 });
  }
  if (d.chat.length > 0) {
    write("Chat transcript", { size: 15, bold: true, gap: 8 });
    for (const m of d.chat) {
      write(m.role === "user" ? "You" : "AI", { size: 11, bold: true, gap: 2 });
      write(m.text, { gap: 10 });
    }
  }

  const bytes = await pdf.save();
  downloadBlob(filename, new Blob([bytes as BlobPart], { type: "application/pdf" }));
}

export function ExportMenu({ data }: { data: ExportData }) {
  const base = slugify(data.title);
  async function safe(fn: () => Promise<void>) {
    try { await fn(); } catch (e) { toast.error(e instanceof Error ? e.message : "Export failed"); }
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-9">
          <Download className="size-4 mr-1.5" /> Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel>Download</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => safe(() => exportPdf(data, `${base}.pdf`))}>
          <FileIcon className="size-4 mr-2" /> PDF (.pdf)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => safe(() => exportDocx(data, `${base}.docx`))}>
          <FileText className="size-4 mr-2" /> Word (.docx)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => download(`${base}.md`, buildMarkdown(data), "text/markdown")}>
          <FileTextIcon className="size-4 mr-2" /> Markdown (.md)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => download(`${base}.txt`, buildText(data), "text/plain")}>
          <FileType className="size-4 mr-2" /> Plain text (.txt)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => download(`${base}.json`, JSON.stringify(data, null, 2), "application/json")}>
          <FileJson className="size-4 mr-2" /> JSON (.json)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
