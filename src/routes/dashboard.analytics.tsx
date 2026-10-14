import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, FileText, Layers, MessageSquare, Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { LazyAnalyticsChart } from "@/components/dashboard/LazyAnalyticsChart";

export const Route = createFileRoute("/dashboard/analytics")({
  head: () => ({ meta: [{ title: "Analytics — mypdf :MindYourPDF AI" }] }),
  component: AnalyticsPage,
});

function AnalyticsPage() {
  const { data } = useQuery({
    queryKey: ["analytics"],
    queryFn: async () => {
      const [docsRes, chunksRes, msgsRes, historyRes] = await Promise.all([
        supabase.from("documents").select("id, title, page_count, status, created_at, favorite"),
        supabase.from("document_chunks").select("id", { count: "exact", head: true }),
        supabase.from("chat_messages").select("id", { count: "exact", head: true }),
        supabase.from("search_history").select("query, created_at").order("created_at", { ascending: false }).limit(10),
      ]);
      const docs = docsRes.data ?? [];
      return {
        docCount: docs.length,
        ready: docs.filter((d) => d.status === "ready").length,
        favorites: docs.filter((d) => d.favorite).length,
        totalPages: docs.reduce((sum, d) => sum + (d.page_count ?? 0), 0),
        chunkCount: chunksRes.count ?? 0,
        msgCount: msgsRes.count ?? 0,
        topDocs: docs
          .filter((d) => d.status === "ready")
          .sort((a, b) => (b.page_count ?? 0) - (a.page_count ?? 0))
          .slice(0, 8)
          .map((d) => ({ name: d.title.slice(0, 22), pages: d.page_count ?? 0 })),
        recentSearches: historyRes.data ?? [],
      };
    },
  });

  const stats = [
    { label: "Documents", value: data?.docCount ?? 0, icon: FileText },
    { label: "Total pages", value: data?.totalPages ?? 0, icon: Layers },
    { label: "Chat messages", value: data?.msgCount ?? 0, icon: MessageSquare },
    { label: "Favorites", value: data?.favorites ?? 0, icon: Star },
  ];

  return (
    <>
      <header className="h-16 border-b border-border flex items-center justify-between px-6 bg-background/50 backdrop-blur-xl sticky top-0 z-10">
        <div>
          <h1 className="font-display font-semibold text-lg">Analytics</h1>
          <p className="text-xs text-muted-foreground">Your library at a glance.</p>
        </div>
      </header>

      <main className="flex-1 p-6">
        <div className="max-w-5xl mx-auto space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {stats.map((s) => (
              <div key={s.label} className="glass rounded-2xl p-5">
                <s.icon className="size-5 text-primary mb-3" />
                <p className="text-2xl font-display font-bold tabular-nums">{s.value.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>

          <div className="glass rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 className="size-4 text-primary" />
              <h2 className="font-display font-semibold">Largest documents</h2>
            </div>
            <div className="h-72">
              {(data?.topDocs.length ?? 0) === 0 ? (
                <p className="text-sm text-muted-foreground">No documents yet.</p>
              ) : (
                <LazyAnalyticsChart data={data?.topDocs ?? []} />

              )}
            </div>
          </div>

          <div className="glass rounded-2xl p-6">
            <h2 className="font-display font-semibold mb-3">Recent searches</h2>
            {(data?.recentSearches.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">Your search history will appear here.</p>
            ) : (
              <ul className="space-y-2">
                {data?.recentSearches.map((s, i) => (
                  <li key={i} className="text-sm flex items-center justify-between border-b border-border/50 pb-2 last:border-0">
                    <span className="truncate">{s.query}</span>
                    <span className="text-xs text-muted-foreground shrink-0 ml-2">
                      {new Date(s.created_at).toLocaleDateString()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
