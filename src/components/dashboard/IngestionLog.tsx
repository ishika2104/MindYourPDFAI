import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, XCircle, CircleSlash, Play, Clock, History } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type EventRow = {
  id: string;
  document_id: string;
  event: "started" | "cancelled" | "completed" | "failed" | "progress";
  message: string | null;
  created_at: string;
};

const meta: Record<
  EventRow["event"],
  { label: string; Icon: typeof Play; tone: string; dot: string }
> = {
  started: { label: "Started", Icon: Play, tone: "text-primary", dot: "bg-primary" },
  completed: { label: "Completed", Icon: CheckCircle2, tone: "text-emerald-400", dot: "bg-emerald-400" },
  failed: { label: "Failed", Icon: XCircle, tone: "text-destructive", dot: "bg-destructive" },
  cancelled: { label: "Cancelled", Icon: CircleSlash, tone: "text-muted-foreground", dot: "bg-muted-foreground" },
  progress: { label: "Progress", Icon: Clock, tone: "text-muted-foreground", dot: "bg-muted-foreground" },
};

function relative(iso: string) {
  const t = new Date(iso).getTime();
  const s = Math.max(1, Math.round((Date.now() - t) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

export function IngestionLog({
  documentId,
  limit = 20,
  title = "Activity log",
  withTitleMap,
}: {
  documentId?: string;
  limit?: number;
  title?: string;
  /** When true and no documentId is set, prepend the document title for context. */
  withTitleMap?: boolean;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["ingestion-events", documentId ?? "all", limit],
    queryFn: async () => {
      let q = supabase
        .from("ingestion_events")
        .select("id, document_id, event, message, created_at")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (documentId) q = q.eq("document_id", documentId);
      const { data: events, error } = await q;
      if (error) throw error;

      let titles: Record<string, string> = {};
      if (withTitleMap && events && events.length > 0) {
        const ids = Array.from(new Set(events.map((e) => e.document_id)));
        const { data: docs } = await supabase.from("documents").select("id, title").in("id", ids);
        titles = Object.fromEntries((docs ?? []).map((d) => [d.id, d.title]));
      }
      return { events: (events ?? []) as EventRow[], titles };
    },
    refetchInterval: 5000,
  });

  const events = data?.events ?? [];

  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <History className="size-4 text-muted-foreground" />
          <h3 className="font-display font-semibold text-sm">{title}</h3>
        </div>
        {events.length > 0 && (
          <span className="text-[11px] text-muted-foreground">{events.length} event{events.length === 1 ? "" : "s"}</span>
        )}
      </div>

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : events.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No ingestion activity yet. Upload a PDF to see started, completed, failed, and cancelled events here.
        </p>
      ) : (
        <ol className="relative space-y-3 before:absolute before:left-[7px] before:top-1 before:bottom-1 before:w-px before:bg-border">
          {events.map((e) => {
            const m = meta[e.event] ?? meta.progress;
            const title = data?.titles?.[e.document_id];
            return (
              <li key={e.id} className="relative pl-6">
                <span className={`absolute left-0 top-1.5 size-[15px] rounded-full ring-2 ring-background ${m.dot}`} />
                <div className="flex items-baseline justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <m.Icon className={`size-3.5 shrink-0 ${m.tone}`} />
                    <span className={`text-xs font-medium ${m.tone}`}>{m.label}</span>
                    {title && (
                      <span className="text-xs text-muted-foreground truncate">· {title}</span>
                    )}
                  </div>
                  <time className="text-[11px] text-muted-foreground tabular-nums shrink-0">{relative(e.created_at)}</time>
                </div>
                {e.message && (
                  <p className="text-xs text-muted-foreground mt-0.5 break-words">{e.message}</p>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
