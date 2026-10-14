import { createFileRoute, Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { ArrowLeft, Download, Loader2, Repeat, Upload, X, FileType2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  TARGETS,
  convertFiles,
  detectKind,
  downloadBlob,
  type ConvertResult,
  type SourceKind,
  type TargetFormat,
} from "@/lib/convert.browser";

export const Route = createFileRoute("/dashboard/convert")({
  head: () => ({
    meta: [
      { title: "Convert files — mypdf :MindYourPDF AI" },
      {
        name: "description",
        content:
          "Convert PDF to Word, Word to PDF, and more — text, Markdown, HTML and page images, all in your browser.",
      },
      { property: "og:title", content: "Convert files — mypdf :MindYourPDF AI" },
      {
        property: "og:description",
        content: "PDF to Word, Word to PDF, Markdown, HTML and images. Private, in-browser conversion.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ConvertPage,
});

const KIND_LABEL: Record<SourceKind, string> = {
  pdf: "PDF",
  docx: "Word document",
  text: "Text / Markdown",
  image: "Image",
};

function ConvertPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [kind, setKind] = useState<SourceKind | null>(null);
  const [target, setTarget] = useState<TargetFormat | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<ConvertResult>([]);
  const [dragging, setDragging] = useState(false);

  function accept(list: FileList | null) {
    const picked = Array.from(list ?? []);
    if (!picked.length) return;
    const k = detectKind(picked[0]);
    if (!k) {
      toast.error("Unsupported file. Try PDF, DOCX, TXT, MD, PNG or JPG.");
      return;
    }
    const same = picked.filter((f) => detectKind(f) === k);
    setFiles(k === "image" ? same : same.slice(0, 5));
    setKind(k);
    setTarget(TARGETS[k][0].id);
    setResults([]);
    setProgress(0);
  }

  async function run() {
    if (!kind || !target || !files.length) return;
    setBusy(true);
    setProgress(0);
    setResults([]);
    try {
      const out = await convertFiles(files, kind, target, (d, t) => setProgress(Math.round((d / t) * 100)));
      setResults(out);
      out.forEach((r) => downloadBlob(r.name, r.blob));
      toast.success(`Converted ${out.length} file${out.length > 1 ? "s" : ""}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Conversion failed");
    } finally {
      setBusy(false);
      setProgress(100);
    }
  }

  function reset() {
    setFiles([]);
    setKind(null);
    setTarget(null);
    setResults([]);
    setProgress(0);
  }

  return (
    <>
      <header className="h-16 border-b border-border flex items-center justify-between px-6 bg-background/50 backdrop-blur-xl sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link to="/dashboard"><ArrowLeft className="size-4" /></Link>
          </Button>
          <div>
            <h1 className="font-display font-semibold text-lg">Convert files</h1>
            <p className="text-xs text-muted-foreground">
              PDF ⇄ Word, plus text, Markdown, HTML and page images — converted right in your browser.
            </p>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 sm:px-8 py-8">
        <div className="max-w-3xl mx-auto space-y-6">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); accept(e.dataTransfer.files); }}
            className={`glass-strong rounded-3xl p-10 text-center transition-colors ${
              dragging ? "ring-2 ring-primary/60 bg-primary/5" : ""
            }`}
          >
            <div className="inline-flex size-14 items-center justify-center rounded-2xl bg-gradient-primary shadow-glow-purple mb-4">
              <Repeat className="size-6 text-primary-foreground" />
            </div>
            <h2 className="text-xl font-display font-bold">Drop a file to convert</h2>
            <p className="text-sm text-muted-foreground mt-2">
              PDF, DOCX, TXT, MD, CSV, JSON, PNG or JPG. Nothing leaves your device.
            </p>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept=".pdf,.docx,.txt,.md,.markdown,.csv,.json,.log,.png,.jpg,.jpeg"
              className="hidden"
              onChange={(e) => accept(e.target.files)}
            />
            <Button
              onClick={() => inputRef.current?.click()}
              className="mt-5 bg-gradient-primary text-primary-foreground hover:opacity-90 shadow-glow-purple"
            >
              <Upload className="size-4 mr-2" /> Choose files
            </Button>
          </div>

          {kind && (
            <div className="glass rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <FileType2 className="size-4 text-primary shrink-0" />
                  <p className="text-sm truncate">
                    {KIND_LABEL[kind]} · {files.length} file{files.length > 1 ? "s" : ""}
                    <span className="text-muted-foreground"> — {files.map((f) => f.name).join(", ")}</span>
                  </p>
                </div>
                <button onClick={reset} className="p-1.5 rounded-md hover:bg-card text-muted-foreground" aria-label="Clear selection">
                  <X className="size-4" />
                </button>
              </div>

              <div>
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">Convert to</p>
                <div className="flex flex-wrap gap-2">
                  {TARGETS[kind].map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setTarget(t.id)}
                      className={`rounded-full px-4 py-2 text-xs transition-colors ${
                        target === t.id
                          ? "bg-primary/15 ring-1 ring-primary/40 text-foreground"
                          : "glass hover:bg-card/80 text-muted-foreground"
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {busy && (
                <div className="h-2 rounded-full bg-card overflow-hidden">
                  <div className="h-full bg-gradient-primary transition-all" style={{ width: `${progress}%` }} />
                </div>
              )}

              <Button
                onClick={run}
                disabled={busy || !target}
                className="w-full h-11 bg-gradient-primary text-primary-foreground hover:opacity-90 shadow-glow-purple"
              >
                {busy ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Repeat className="size-4 mr-2" />}
                {busy ? "Converting…" : "Convert & download"}
              </Button>
            </div>
          )}

          {results.length > 0 && (
            <div className="glass rounded-2xl p-5">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-3">Results</p>
              <div className="space-y-1">
                {results.map((r) => (
                  <div key={r.name} className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg hover:bg-card/60">
                    <p className="text-sm truncate">{r.name}</p>
                    <Button size="sm" variant="ghost" onClick={() => downloadBlob(r.name, r.blob)}>
                      <Download className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
