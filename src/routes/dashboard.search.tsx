import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search, Loader2, FileText, ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { crossDocumentSearch } from "@/lib/search.functions";

export const Route = createFileRoute("/dashboard/search")({
  head: () => ({ meta: [{ title: "Search — mypdf :MindYourPDF AI" }] }),
  component: SearchPage,
});

type Hit = {
  id: string;
  documentId: string;
  documentTitle: string;
  page: number | null;
  content: string;
  similarity: number;
};

function SearchPage() {
  const runSearch = useServerFn(crossDocumentSearch);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Hit[] | null>(null);

  const m = useMutation({
    mutationFn: async (query: string) => runSearch({ data: { query, limit: 20 } }),
    onSuccess: (r) => setResults(r.results),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Search failed"),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim() || m.isPending) return;
    m.mutate(q.trim());
  }

  const suggestions = [
    "Where is the methodology described?",
    "Which document mentions revenue growth?",
    "Find all references to compliance risks",
  ];

  return (
    <>
      <header className="h-16 border-b border-border flex items-center justify-between px-6 bg-background/50 backdrop-blur-xl sticky top-0 z-10">
        <div>
          <h1 className="font-display font-semibold text-lg">Universal search</h1>
          <p className="text-xs text-muted-foreground">Semantic search across every PDF in your library.</p>
        </div>
      </header>

      <main className="flex-1 p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          <form onSubmit={submit} className="glass-strong rounded-2xl p-3 flex items-center gap-2">
            <Search className="size-5 ml-2 text-muted-foreground" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Ask a question or describe what you're looking for…"
              className="flex-1 bg-transparent outline-none text-sm h-11"
            />
            <Button
              type="submit"
              disabled={!q.trim() || m.isPending}
              className="h-10 bg-gradient-primary text-primary-foreground hover:opacity-90 shadow-glow-purple"
            >
              {m.isPending ? <Loader2 className="size-4 animate-spin" /> : "Search"}
            </Button>
          </form>

          {!results && !m.isPending && (
            <div className="text-center py-8">
              <div className="inline-flex size-14 items-center justify-center rounded-2xl bg-gradient-primary shadow-glow-purple mb-4">
                <Sparkles className="size-6 text-primary-foreground" />
              </div>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Search finds meaning, not just keywords. Ask about ideas and it pulls the exact page from any of your PDFs.
              </p>
              <div className="mt-5 flex flex-wrap gap-2 justify-center">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => { setQ(s); m.mutate(s); }}
                    className="glass rounded-full px-4 py-2 text-xs hover:bg-card/80 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {results && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                {results.length} result{results.length === 1 ? "" : "s"}
              </p>
              {results.length === 0 && (
                <div className="glass rounded-2xl p-8 text-center text-sm text-muted-foreground">
                  Nothing matched. Try rewording, or upload more documents.
                </div>
              )}
              {results.map((r) => (
                <Link
                  key={r.id}
                  to="/dashboard/$documentId"
                  params={{ documentId: r.documentId }}
                  className="block glass rounded-2xl p-5 hover:bg-card/80 transition-all hover:-translate-y-0.5 hover:shadow-glow group"
                >
                  <div className="flex items-start gap-3">
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
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium truncate">{r.documentTitle}</span>
                        {r.page != null && (
                          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            Page {r.page}
                          </span>
                        )}
                        <span className="ml-auto text-[10px] text-primary tabular-nums">
                          {Math.round(r.similarity * 100)}% match
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-2 line-clamp-3">
                        {r.content}
                      </p>
                    </div>
                    <ArrowRight className="size-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity mt-1" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
