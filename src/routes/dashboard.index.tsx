import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Upload, FileText, Loader2, MessageSquare, Sparkles, CheckCircle2, XCircle, X, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  startIngestion,
  embedChunkBatch,
  finalizeIngestion,
  failIngestion,
  cancelIngestion,
  chunkText,
} from "@/lib/documents.functions";
import { extractPdfPages, CancelledError } from "@/lib/pdf-extract.browser";
import { IngestionLog } from "@/components/dashboard/IngestionLog";
import { FoldersBar, MoveToFolderMenu } from "@/components/dashboard/Folders";

export const Route = createFileRoute("/dashboard/")({
  component: DashboardHome,
});

type Stage = "idle" | "reading" | "uploading" | "creating" | "indexing" | "done" | "error";

interface ProgressState {
  stage: Stage;
  percent: number; // 0-100
  message: string;
  detail?: string;
}

// Weights for each stage of the pipeline (must sum to 100)
const WEIGHTS = { reading: 20, uploading: 15, creating: 5, indexing: 60 } as const;

function uploadWithProgress(path: string, file: File, onPct: (pct: number) => void) {
  // Use the resumable/standard upload but report a smooth fake-progress fallback
  // when supabase-js doesn't expose XHR progress in this env.
  return new Promise<void>((resolve, reject) => {
    let pct = 0;
    const timer = setInterval(() => {
      // Asymptotic creep to 90% until the real upload resolves
      pct = Math.min(90, pct + Math.max(1, (90 - pct) * 0.12));
      onPct(pct);
    }, 200);
    supabase.storage
      .from("pdfs")
      .upload(path, file, { contentType: "application/pdf", upsert: false })
      .then(({ error }) => {
        clearInterval(timer);
        if (error) return reject(error);
        onPct(100);
        resolve();
      })
      .catch((e) => {
        clearInterval(timer);
        reject(e);
      });
  });
}

function DashboardHome() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const startFn = useServerFn(startIngestion);
  const embedFn = useServerFn(embedChunkBatch);
  const finalizeFn = useServerFn(finalizeIngestion);
  const failFn = useServerFn(failIngestion);
  const cancelFn = useServerFn(cancelIngestion);

  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<ProgressState>({ stage: "idle", percent: 0, message: "" });
  const cancelRef = useRef(false);
  const jobRef = useRef<{ documentId?: string; filePath?: string }>({});
  const [activeFolder, setActiveFolder] = useState<string | null | "all">("all");

  const { data: docs = [] } = useQuery({
    queryKey: ["documents-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documents")
        .select("id, title, status, page_count, size_bytes, created_at, favorite, folder_id")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];

    },
    refetchInterval: (q) => {
      const list = q.state.data as { status: string }[] | undefined;
      return list?.some((d) => d.status === "processing" || d.status === "pending") ? 2000 : false;
    },
  });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
        throw new Error("Please upload a PDF file");
      }
      if (file.size > 25 * 1024 * 1024) throw new Error("File must be under 25MB");

      const { data: sess } = await supabase.auth.getUser();
      const userId = sess.user?.id;
      if (!userId) throw new Error("Not signed in");

      cancelRef.current = false;
      jobRef.current = {};
      const checkCancel = () => {
        if (cancelRef.current) throw new CancelledError();
      };

      // 1. READING — extract pages with per-page progress
      setProgress({ stage: "reading", percent: 0, message: "Reading PDF…", detail: "Parsing pages" });
      const pages = await extractPdfPages(
        file,
        (done, total) => {
          const sub = done / total;
          setProgress({
            stage: "reading",
            percent: Math.round(sub * WEIGHTS.reading),
            message: "Reading PDF…",
            detail: `Page ${done} of ${total}`,
          });
        },
        () => cancelRef.current,
        (stage: string) => setProgress((p) => (p ? { ...p, message: stage } : p)),
      );
      if (pages.length === 0) throw new Error("PDF appears empty");
      checkCancel();

      // 2. UPLOADING — push file to storage
      const path = `${userId}/${crypto.randomUUID()}-${file.name.replace(/[^a-z0-9.\-_]/gi, "_")}`;
      jobRef.current.filePath = path;
      await uploadWithProgress(path, file, (pct) => {
        setProgress({
          stage: "uploading",
          percent: WEIGHTS.reading + Math.round((pct / 100) * WEIGHTS.uploading),
          message: "Uploading file…",
          detail: `${Math.round((file.size / 1024 / 1024) * (pct / 100) * 10) / 10} / ${
            Math.round((file.size / 1024 / 1024) * 10) / 10
          } MB`,
        });
      });
      checkCancel();

      // 3. CREATING — insert document row
      setProgress({
        stage: "creating",
        percent: WEIGHTS.reading + WEIGHTS.uploading,
        message: "Creating document…",
        detail: "Registering with your library",
      });
      const { data: doc, error: docErr } = await supabase
        .from("documents")
        .insert({
          user_id: userId,
          title: file.name.replace(/\.pdf$/i, ""),
          file_path: path,
          size_bytes: file.size,
          status: "pending",
        })
        .select("id")
        .single();
      if (docErr || !doc) throw docErr ?? new Error("Could not create document");
      jobRef.current.documentId = doc.id;
      checkCancel();

      const baseAfterCreate = WEIGHTS.reading + WEIGHTS.uploading + WEIGHTS.creating;
      setProgress({
        stage: "indexing",
        percent: baseAfterCreate,
        message: "Indexing with AI…",
        detail: "Preparing chunks",
      });

      // Build all chunks client-side so we can stream batches with progress
      const allChunks: { page: number; content: string }[] = [];
      for (const p of pages) for (const c of chunkText(p.text, p.page)) allChunks.push(c);
      if (allChunks.length === 0) {
        await failFn({ data: { documentId: doc.id, message: "No extractable text found in PDF" } });
        throw new Error("No extractable text found in PDF");
      }

      try {
        await startFn({ data: { documentId: doc.id, totalPages: pages.length } });

        // 4. INDEXING — embed in batches with live progress
        const batchSize = 32;
        let done = 0;
        for (let i = 0; i < allChunks.length; i += batchSize) {
          checkCancel();
          const batch = allChunks.slice(i, i + batchSize);
          await embedFn({ data: { documentId: doc.id, startIndex: i, chunks: batch } });
          done += batch.length;
          const sub = done / allChunks.length;
          setProgress({
            stage: "indexing",
            percent: Math.min(99, baseAfterCreate + Math.round(sub * WEIGHTS.indexing)),
            message: "Indexing with AI…",
            detail: `${done} / ${allChunks.length} chunks embedded`,
          });
        }

        checkCancel();
        await finalizeFn({ data: { documentId: doc.id, totalChunks: allChunks.length } });
        setProgress({
          stage: "done",
          percent: 100,
          message: "Ready to chat",
          detail: `${allChunks.length} chunks indexed across ${pages.length} pages`,
        });
        return doc.id;
      } catch (err) {
        if (err instanceof CancelledError) throw err;
        const message = err instanceof Error ? err.message : String(err);
        await failFn({ data: { documentId: doc.id, message } }).catch(() => {});
        throw err;
      }
    },
    onSuccess: (docId) => {
      toast.success("Document ready — start chatting");
      qc.invalidateQueries({ queryKey: ["documents"] });
      qc.invalidateQueries({ queryKey: ["documents-list"] });
      // small delay so the user sees the 100% state
      setTimeout(() => {
        setProgress({ stage: "idle", percent: 0, message: "" });
        navigate({ to: "/dashboard/$documentId", params: { documentId: docId } });
      }, 600);
    },
    onError: async (err) => {
      if (err instanceof CancelledError) {
        // Best-effort cleanup of any partial state created so far.
        const { documentId, filePath } = jobRef.current;
        if (documentId || filePath) {
          await cancelFn({ data: { documentId, filePath } }).catch(() => {});
        }
        qc.invalidateQueries({ queryKey: ["documents-list"] });
        setProgress({ stage: "idle", percent: 0, message: "" });
        toast.message("Upload cancelled");
        return;
      }
      setProgress({
        stage: "error",
        percent: 0,
        message: "Upload failed",
        detail: err instanceof Error ? err.message : "Something went wrong",
      });
      toast.error(err instanceof Error ? err.message : "Upload failed");
      setTimeout(() => setProgress({ stage: "idle", percent: 0, message: "" }), 4000);
    },
  });

  function handleCancel() {
    cancelRef.current = true;
    setProgress((p) => ({ ...p, message: "Cancelling…", detail: "Cleaning up" }));
  }


  function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (file) upload.mutate(file);
  }

  const busy = upload.isPending;
  const showProgress = busy || progress.stage === "done" || progress.stage === "error";

  return (
    <>
      <header className="h-16 border-b border-border flex items-center justify-between px-6 bg-background/50 backdrop-blur-xl sticky top-0 z-10">
        <div>
          <h1 className="font-display font-semibold text-lg">Overview</h1>
          <p className="text-xs text-muted-foreground">Upload a PDF and chat with it instantly.</p>
        </div>
      </header>

      <main className="flex-1 p-6">
        <div className="max-w-5xl mx-auto space-y-8">
          {/* Upload zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
            onClick={() => !busy && fileRef.current?.click()}
            className={`relative glass-strong rounded-3xl p-12 text-center overflow-hidden transition-all ${
              dragging ? "ring-2 ring-primary/60" : busy ? "" : "hover:bg-card/60 cursor-pointer"
            }`}
          >
            <div className="absolute -top-20 left-1/3 w-[300px] h-[300px] bg-primary/30 rounded-full blur-[120px]" />
            <div className="absolute -bottom-20 right-1/4 w-[300px] h-[300px] rounded-full blur-[120px]" style={{ background: "color-mix(in oklch, var(--brand-purple) 40%, transparent)" }} />
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
            <div className="relative">
              <div className={`inline-flex size-14 items-center justify-center rounded-2xl bg-gradient-primary shadow-glow-purple mb-4 ${
                progress.stage === "error" ? "!bg-destructive/80" : ""
              }`}>
                {progress.stage === "done" ? (
                  <CheckCircle2 className="size-6 text-primary-foreground" />
                ) : progress.stage === "error" ? (
                  <XCircle className="size-6 text-primary-foreground" />
                ) : busy ? (
                  <Loader2 className="size-6 text-primary-foreground animate-spin" />
                ) : (
                  <Upload className="size-6 text-primary-foreground" />
                )}
              </div>
              <h2 className="text-2xl font-display font-bold">
                {progress.stage === "done"
                  ? "Ready to chat"
                  : progress.stage === "error"
                  ? "Upload failed"
                  : busy
                  ? progress.message || "Processing…"
                  : "Drop a PDF to get started"}
              </h2>

              {showProgress ? (
                <div className="mt-5 max-w-md mx-auto">
                  <div className="h-2 rounded-full bg-card/80 overflow-hidden ring-1 ring-border">
                    <div
                      className={`h-full transition-all duration-300 ease-out ${
                        progress.stage === "error"
                          ? "bg-destructive"
                          : "bg-gradient-primary shadow-glow-purple"
                      }`}
                      style={{ width: `${progress.percent}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                    <span className="truncate">{progress.detail ?? ""}</span>
                    <span className="tabular-nums font-medium text-foreground/80">
                      {progress.stage === "error" ? "—" : `${progress.percent}%`}
                    </span>
                  </div>
                  <div className="flex items-center justify-center gap-2 mt-4 text-[11px] uppercase tracking-wider text-muted-foreground">
                    <StageDot label="Read" active={progress.stage === "reading"} done={["uploading","creating","indexing","done"].includes(progress.stage)} />
                    <StageBar />
                    <StageDot label="Upload" active={progress.stage === "uploading"} done={["creating","indexing","done"].includes(progress.stage)} />
                    <StageBar />
                    <StageDot label="Save" active={progress.stage === "creating"} done={["indexing","done"].includes(progress.stage)} />
                    <StageBar />
                    <StageDot label="Index" active={progress.stage === "indexing"} done={progress.stage === "done"} />
                  </div>
                  {busy && (
                    <div className="mt-5">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); handleCancel(); }}
                        disabled={cancelRef.current}
                        className="h-9"
                      >
                        <X className="size-4 mr-1.5" />
                        {cancelRef.current ? "Cancelling…" : "Cancel upload"}
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground max-w-sm mx-auto mt-2">
                    Your document will be indexed and ready to chat, summarize, search, and listen — in seconds.
                  </p>
                  <Button className="mt-6 h-11 px-6 bg-gradient-primary text-primary-foreground hover:opacity-90 shadow-glow-purple">
                    <Upload className="size-4 mr-2" /> Choose file
                  </Button>
                  <p className="text-[11px] text-muted-foreground mt-3">PDF · up to 25MB</p>
                </>
              )}
            </div>
          </div>

          {/* Recent */}
          <div>
            <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
              <h3 className="font-display font-semibold">Recent documents</h3>
            </div>
            <div className="mb-4">
              <FoldersBar selected={activeFolder} onSelect={setActiveFolder} />
            </div>
            {(() => {
              const visible = docs.filter((d) =>
                activeFolder === "all" ? true : (d.folder_id ?? null) === activeFolder,
              );
              return visible.length === 0 ? (
              <div className="glass rounded-2xl p-10 text-center text-sm text-muted-foreground">
                <FileText className="size-8 mx-auto mb-3 opacity-50" />
                {docs.length === 0
                  ? "No documents yet. Upload your first PDF to see it here."
                  : "No documents in this folder yet. Use the folder icon on a card to move one here."}
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {[...visible]
                  .sort((a, b) => Number(!!b.favorite) - Number(!!a.favorite))
                  .map((d) => (
                  <div
                    key={d.id}
                    onClick={() => navigate({ to: "/dashboard/$documentId", params: { documentId: d.id } })}
                    className="text-left glass rounded-2xl p-5 hover:bg-card/80 transition-all hover:-translate-y-0.5 hover:shadow-glow group cursor-pointer relative"
                  >
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        const next = !d.favorite;
                        qc.setQueryData(["documents-list"], (prev: typeof docs | undefined) =>
                          prev?.map((x) => (x.id === d.id ? { ...x, favorite: next } : x)) ?? prev,
                        );
                        const { error } = await supabase
                          .from("documents")
                          .update({ favorite: next })
                          .eq("id", d.id);
                        if (error) {
                          toast.error("Could not update favorite");
                          qc.invalidateQueries({ queryKey: ["documents-list"] });
                        }
                      }}
                      className="absolute top-3 right-9 opacity-70 hover:opacity-100 transition-opacity"
                      title={d.favorite ? "Unfavorite" : "Favorite"}
                    >
                      <Star
                        className={`size-4 ${d.favorite ? "fill-primary text-primary" : "text-muted-foreground"}`}
                      />
                    </button>
                    <div className="absolute top-2.5 right-2.5">
                      <MoveToFolderMenu documentId={d.id} folderId={d.folder_id ?? null} />
                    </div>
                    <div className="flex items-start gap-3 pr-6">
                      <div
                        className="size-10 rounded-xl flex items-center justify-center shrink-0"
                        style={{
                          background: "color-mix(in oklch, var(--brand-purple) 14%, transparent)",
                          boxShadow: "inset 0 0 0 1px color-mix(in oklch, var(--brand-purple) 35%, transparent)",
                        }}
                      >
                        <FileText className="size-5" style={{ color: "var(--brand-purple-glow)" }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{d.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {d.status === "ready" ? `${d.page_count ?? "?"} pages` :
                           d.status === "failed" ? "Failed to index" :
                           d.status === "cancelled" ? "Cancelled" :
                           d.status === "processing" ? "Indexing…" : "Pending"}
                        </p>
                      </div>
                      <span className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <MessageSquare className="size-4 text-primary" />
                      </span>
                    </div>
                    {d.status === "processing" && (
                      <div className="mt-3 h-1 rounded-full overflow-hidden bg-card">
                        <div className="h-full w-1/2 bg-gradient-primary animate-pulse" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            );
            })()}
          </div>


          {/* Activity log */}
          <IngestionLog withTitleMap title="Recent ingestion activity" />

          {/* Helper */}
          <div className="glass rounded-2xl p-5 flex items-start gap-3">
            <Sparkles className="size-5 text-purple mt-0.5" />
            <div className="text-sm text-muted-foreground">
              <span className="text-foreground font-medium">Tip:</span> the larger the document, the longer indexing takes. Embeddings are generated for every page so answers can cite exact pages.
            </div>
          </div>
        </div>
      </main>
    </>
  );
}

function StageDot({ label, active, done }: { label: string; active: boolean; done: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className={`size-2 rounded-full transition-all ${
          done ? "bg-primary" : active ? "bg-primary animate-pulse shadow-glow-purple" : "bg-muted"
        }`}
      />
      <span className={done || active ? "text-foreground/80" : ""}>{label}</span>
    </div>
  );
}

function StageBar() {
  return <span className="h-px w-4 bg-border" />;
}
