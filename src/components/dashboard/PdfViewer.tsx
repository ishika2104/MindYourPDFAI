import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft, ChevronRight, ZoomIn, ZoomOut, RotateCw, Search, Loader2,
  Play, Pause, Square, Volume2, X, Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { loadPdfjs } from "@/lib/pdf-extract.browser";
import { useSpeech } from "@/hooks/useSpeech";
import { toast } from "sonner";

type PdfjsLib = Awaited<ReturnType<typeof loadPdfjs>>;
type PDFDocumentProxy = Awaited<ReturnType<PdfjsLib["getDocument"]>["promise"]>;

type Match = { page: number; snippet: string };

export function PdfViewer({
  documentId,
  filePath,
  initialPage = 1,
}: {
  documentId: string;
  filePath: string;
  initialPage?: number;
}) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(initialPage);
  const [scale, setScale] = useState(1.2);
  const [rotation, setRotation] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pageText, setPageText] = useState("");
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [fileUrl, setFileUrl] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const thumbRefs = useRef<Record<number, HTMLCanvasElement | null>>({});
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null);
  const textCacheRef = useRef<Map<number, string>>(new Map());

  const speech = useSpeech();

  // Load the PDF from private storage via a signed URL.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase.storage.from("pdfs").createSignedUrl(filePath, 3600);
        if (error || !data?.signedUrl) throw error ?? new Error("Could not sign URL");
        if (cancelled) return;
        setFileUrl(data.signedUrl);
        const pdfjs = await loadPdfjs();
        const doc = await pdfjs.getDocument({ url: data.signedUrl }).promise;
        if (cancelled) return;
        setPdf(doc);
        setNumPages(doc.numPages);
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Could not open this PDF");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filePath]);

  const getPageText = useCallback(
    async (n: number) => {
      const cached = textCacheRef.current.get(n);
      if (cached !== undefined) return cached;
      if (!pdf) return "";
      const p = await pdf.getPage(n);
      const content = await p.getTextContent();
      const text = content.items
        .map((it: unknown) => (it as { str?: string }).str ?? "")
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      textCacheRef.current.set(n, text);
      return text;
    },
    [pdf],
  );

  // Render the active page.
  useEffect(() => {
    if (!pdf || !canvasRef.current) return;
    let cancelled = false;
    (async () => {
      const p = await pdf.getPage(page);
      if (cancelled) return;
      const viewport = p.getViewport({ scale, rotation });
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      renderTaskRef.current?.cancel();
      const task = p.render({ canvas, canvasContext: ctx, viewport } as never);
      renderTaskRef.current = task;
      try {
        await task.promise;
      } catch {
        /* cancelled render */
      }
      const text = await getPageText(page);
      if (!cancelled) setPageText(text);
    })();
    return () => {
      cancelled = true;
    };
  }, [pdf, page, scale, rotation, getPageText]);

  // Render thumbnails (capped for very large documents).
  const thumbPages = useMemo(
    () => Array.from({ length: Math.min(numPages, 200) }, (_, i) => i + 1),
    [numPages],
  );

  useEffect(() => {
    if (!pdf) return;
    let cancelled = false;
    (async () => {
      for (const n of thumbPages) {
        if (cancelled) return;
        const canvas = thumbRefs.current[n];
        if (!canvas || canvas.dataset["rendered"] === "1") continue;
        const p = await pdf.getPage(n);
        const viewport = p.getViewport({ scale: 0.22 });
        const ctx = canvas.getContext("2d");
        if (!ctx) continue;
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        try {
          await p.render({ canvas, canvasContext: ctx, viewport } as never).promise;
          canvas.dataset["rendered"] = "1";
        } catch {
          /* ignore */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pdf, thumbPages]);

  // Stop narration whenever the page changes.
  useEffect(() => {
    speech.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  // Keyboard shortcuts (ignored while typing in a field).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (
        e.metaKey || e.ctrlKey || e.altKey ||
        (t && (t.isContentEditable || /^(input|textarea|select)$/i.test(t.tagName)))
      ) return;

      switch (e.key) {
        case "ArrowLeft":
          setPage((p) => Math.max(1, p - 1));
          break;
        case "ArrowRight":
          setPage((p) => Math.min(numPages || 1, p + 1));
          break;
        case "+":
        case "=":
          setScale((s) => Math.min(3, +(s + 0.2).toFixed(2)));
          break;
        case "-":
          setScale((s) => Math.max(0.5, +(s - 0.2).toFixed(2)));
          break;
        case "r":
        case "R":
          setRotation((r) => (r + 90) % 360);
          break;
        case "p":
        case "P":
        case " ":
          if (!speech.supported) return;
          if (speech.state === "speaking") speech.pause();
          else if (speech.state === "paused") speech.resume();
          else if (pageText) speech.speak(pageText);
          break;
        case "s":
        case "S":
          if (speech.state !== "idle") speech.stop();
          else return;
          break;
        default:
          return;
      }
      e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [numPages, pageText, speech]);

  const speechStatus =
    speech.state === "speaking"
      ? `Reading page ${page} aloud${speech.chunkCount ? `, sentence ${speech.chunkIndex + 1} of ${speech.chunkCount}` : ""}`
      : speech.state === "paused"
        ? "Narration paused"
        : "Narration stopped";


  async function runSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q || !pdf) return;
    setSearching(true);
    setMatches([]);
    try {
      const found: Match[] = [];
      for (let n = 1; n <= numPages; n++) {
        const text = await getPageText(n);
        const idx = text.toLowerCase().indexOf(q.toLowerCase());
        if (idx >= 0) {
          found.push({
            page: n,
            snippet: `…${text.slice(Math.max(0, idx - 60), idx + q.length + 60)}…`,
          });
        }
        if (found.length >= 100) break;
      }
      setMatches(found);
      if (found.length === 0) toast.info(`No matches for “${q}”`);
    } finally {
      setSearching(false);
    }
  }

  if (loadError) {
    return (
      <div className="glass rounded-2xl p-6 text-sm">
        <p className="font-medium">Couldn't open this PDF.</p>
        <p className="text-muted-foreground mt-1">{loadError}</p>
      </div>
    );
  }

  return (
    <div className="flex gap-4 h-full min-h-0">
      {/* Thumbnails */}
      <nav className="hidden xl:flex flex-col w-40 shrink-0 glass rounded-2xl p-2 overflow-y-auto" aria-label="Page thumbnails">
        <p className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground" id="pdf-thumbs-label">Pages</p>
        {thumbPages.map((n) => (
          <button
            key={n}
            onClick={() => setPage(n)}
            aria-label={`Go to page ${n}`}
            aria-current={n === page ? "page" : undefined}
            className={`mb-2 rounded-lg p-1 transition-colors ${
              n === page ? "ring-2 ring-primary bg-primary/10" : "hover:bg-card/70"
            }`}
          >
            <canvas
              aria-hidden="true"
              ref={(el) => {
                thumbRefs.current[n] = el;
              }}
              className="w-full rounded bg-white"
            />
            <span className="block text-[10px] text-muted-foreground mt-1">{n}</span>
          </button>
        ))}
      </nav>

      <div className="flex-1 min-w-0 flex flex-col gap-3">
        {/* Toolbar */}
        <div className="glass rounded-2xl p-2 flex flex-wrap items-center gap-2" role="toolbar" aria-label="Document viewer controls">
          <Button variant="ghost" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} aria-label="Previous page (Left arrow)" title="Previous page (←)">
            <ChevronLeft className="size-4" aria-hidden="true" />
          </Button>
          <span className="text-xs tabular-nums text-muted-foreground" aria-live="polite">
            {numPages ? `Page ${page} of ${numPages}` : "…"}
          </span>
          <Button variant="ghost" size="sm" onClick={() => setPage((p) => Math.min(numPages, p + 1))} disabled={page >= numPages} aria-label="Next page (Right arrow)" title="Next page (→)">
            <ChevronRight className="size-4" aria-hidden="true" />
          </Button>

          <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />

          <Button variant="ghost" size="sm" onClick={() => setScale((s) => Math.max(0.5, +(s - 0.2).toFixed(2)))} aria-label="Zoom out (minus key)" title="Zoom out (−)">
            <ZoomOut className="size-4" aria-hidden="true" />
          </Button>
          <span className="text-xs tabular-nums text-muted-foreground w-10 text-center" aria-label={`Zoom ${Math.round(scale * 100)} percent`}>{Math.round(scale * 100)}%</span>
          <Button variant="ghost" size="sm" onClick={() => setScale((s) => Math.min(3, +(s + 0.2).toFixed(2)))} aria-label="Zoom in (plus key)" title="Zoom in (+)">
            <ZoomIn className="size-4" aria-hidden="true" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setRotation((r) => (r + 90) % 360)} aria-label="Rotate page 90 degrees (R)" title="Rotate (R)">
            <RotateCw className="size-4" aria-hidden="true" />
          </Button>

          <form onSubmit={runSearch} className="flex items-center gap-1.5 ml-auto" role="search" aria-label="Find in document">
            <div className="relative">
              <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <input
                id="pdf-find-input"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Find in document…"
                aria-label="Find text in document"
                className="h-9 w-44 sm:w-56 pl-8 pr-7 rounded-xl glass-strong text-xs outline-none focus:ring-2 focus:ring-primary/50"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => { setQuery(""); setMatches(null); }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label="Clear search"
                >
                  <X className="size-3.5" aria-hidden="true" />
                </button>
              )}
            </div>
            <Button type="submit" size="sm" variant="ghost" disabled={searching || !pdf} aria-label="Search document">
              {searching ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : "Find"}
            </Button>
          </form>

          {fileUrl && (
            <Button asChild variant="ghost" size="sm">
              <a href={fileUrl} target="_blank" rel="noreferrer" aria-label="Download original PDF" title="Download original">
                <Download className="size-4" aria-hidden="true" />
              </a>
            </Button>
          )}
        </div>

        {/* Text-to-speech bar */}
        <section
          className="glass rounded-2xl p-3 flex flex-wrap items-center gap-3"
          aria-label="Read aloud controls. Shortcuts: P or Space to play or pause, S to stop."
        >
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Volume2 className="size-4 text-primary" aria-hidden="true" /> Read aloud
          </div>

          <span className="sr-only" role="status" aria-live="polite">{speechStatus}</span>

          {!speech.supported ? (
            <span className="text-xs text-muted-foreground">Not supported in this browser.</span>
          ) : (
            <>
              {speech.state === "speaking" ? (
                <Button size="sm" variant="ghost" onClick={speech.pause} aria-label="Pause narration (P)" title="Pause (P)">
                  <Pause className="size-4 mr-1" aria-hidden="true" /> Pause
                </Button>
              ) : speech.state === "paused" ? (
                <Button size="sm" variant="ghost" onClick={speech.resume} aria-label="Resume narration (P)" title="Resume (P)">
                  <Play className="size-4 mr-1" aria-hidden="true" /> Resume
                </Button>
              ) : (
                <Button
                  size="sm"
                  className="bg-gradient-primary text-primary-foreground hover:opacity-90"
                  disabled={!pageText}
                  onClick={() => speech.speak(pageText)}
                  aria-label={`Read page ${page} aloud (P)`}
                  title="Play page (P)"
                >
                  <Play className="size-4 mr-1" aria-hidden="true" /> Play page
                </Button>
              )}
              {speech.state !== "idle" && (
                <Button size="sm" variant="ghost" onClick={speech.stop} aria-label="Stop narration (S)" title="Stop (S)">
                  <Square className="size-4 mr-1" aria-hidden="true" /> Stop
                </Button>
              )}

              <Select value={speech.voiceURI} onValueChange={speech.setVoiceURI}>
                <SelectTrigger className="h-8 w-44 text-xs" aria-label="Narration voice">
                  <SelectValue placeholder="Voice" />
                </SelectTrigger>
                <SelectContent>
                  {speech.voices.map((v) => (
                    <SelectItem key={v.voiceURI} value={v.voiceURI} className="text-xs">
                      {v.name} ({v.lang})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="flex items-center gap-2 min-w-[130px]">
                <span className="text-[11px] text-muted-foreground" id="tts-speed-label">Speed</span>
                <Slider
                  value={[speech.rate]} min={0.5} max={2} step={0.1}
                  onValueChange={([v]) => speech.setRate(v)}
                  className="w-20"
                  aria-label="Narration speed"
                  aria-labelledby="tts-speed-label"
                  aria-valuetext={`${speech.rate.toFixed(1)} times speed`}
                />
                <span className="text-[11px] tabular-nums text-muted-foreground">{speech.rate.toFixed(1)}x</span>
              </div>
              <div className="flex items-center gap-2 min-w-[130px]">
                <span className="text-[11px] text-muted-foreground" id="tts-pitch-label">Pitch</span>
                <Slider
                  value={[speech.pitch]} min={0.5} max={2} step={0.1}
                  onValueChange={([v]) => speech.setPitch(v)}
                  className="w-20"
                  aria-label="Narration pitch"
                  aria-labelledby="tts-pitch-label"
                  aria-valuetext={`Pitch ${speech.pitch.toFixed(1)}`}
                />
                <span className="text-[11px] tabular-nums text-muted-foreground">{speech.pitch.toFixed(1)}</span>
              </div>

              {speech.state !== "idle" && speech.chunkCount > 0 && (
                <span className="text-[11px] text-muted-foreground">
                  {speech.chunkIndex + 1}/{speech.chunkCount}
                </span>
              )}

              <span className="text-[11px] text-muted-foreground ml-auto hidden sm:inline">
                Shortcuts: P play/pause · S stop · ←/→ pages · +/− zoom · R rotate
              </span>
            </>
          )}
        </section>


        {/* Search results */}
        {matches && matches.length > 0 && (
          <div className="glass rounded-2xl p-3 max-h-40 overflow-y-auto space-y-1.5">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
              {matches.length} page{matches.length === 1 ? "" : "s"} matched
            </p>
            {matches.map((m) => (
              <button
                key={m.page}
                onClick={() => setPage(m.page)}
                className="w-full text-left rounded-lg px-3 py-2 hover:bg-card/70 transition-colors"
              >
                <span className="text-xs font-medium text-primary">Page {m.page}</span>
                <p className="text-xs text-muted-foreground line-clamp-2">{m.snippet}</p>
              </button>
            ))}
          </div>
        )}

        {/* Canvas */}
        <div className="flex-1 min-h-0 overflow-auto rounded-2xl glass p-4 flex justify-center items-start">
          {!pdf ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-16">
              <Loader2 className="size-4 animate-spin" /> Loading PDF…
            </div>
          ) : (
            <canvas
              key={documentId}
              ref={canvasRef}
              className="rounded-lg shadow-lg bg-white max-w-full"
            />
          )}
        </div>
      </div>
    </div>
  );
}
