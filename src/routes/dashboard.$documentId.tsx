import { createFileRoute, useParams, Link } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState, useRef, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { ArrowLeft, Send, Loader2, FileText, Sparkles, AlertCircle, MessageSquare, Brain, BookOpen, GraduationCap, FlaskConical, Trash2, Wand2, BookMarked } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { IngestionLog } from "@/components/dashboard/IngestionLog";
import { LazyMarkdown } from "@/components/dashboard/LazyMarkdown";

const SummariesPanel = lazy(() => import("@/components/dashboard/SummariesPanel").then(m => ({ default: m.SummariesPanel })));
const InsightsPanel = lazy(() => import("@/components/dashboard/InsightsPanel").then(m => ({ default: m.InsightsPanel })));
const IntelligencePanel = lazy(() => import("@/components/dashboard/IntelligencePanel").then(m => ({ default: m.IntelligencePanel })));
const StudyPanel = lazy(() => import("@/components/dashboard/StudyPanel").then(m => ({ default: m.StudyPanel })));
const ExportMenu = lazy(() => import("@/components/dashboard/ExportMenu").then(m => ({ default: m.ExportMenu })));
const PdfViewer = lazy(() => import("@/components/dashboard/PdfViewer").then(m => ({ default: m.PdfViewer })));
import {
  getOrCreateSession,
  listSessionMessages,
  persistMessage,
  clearSession,
  suggestFollowups,
} from "@/lib/chat.functions";

export const Route = createFileRoute("/dashboard/$documentId")({
  component: DocumentChatPage,
});

function textOf(m: UIMessage): string {
  return m.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
}

function DocumentChatPage() {
  const { documentId } = useParams({ from: "/dashboard/$documentId" });
  const [token, setToken] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [researchMode, setResearchMode] = useState(false);
  const [followups, setFollowups] = useState<string[]>([]);
  const [loadingFollowups, setLoadingFollowups] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const persistedIdsRef = useRef<Set<string>>(new Set());
  const prevStatusRef = useRef<string>("ready");

  const getOrCreateFn = useServerFn(getOrCreateSession);
  const listFn = useServerFn(listSessionMessages);
  const persistFn = useServerFn(persistMessage);
  const clearFn = useServerFn(clearSession);
  const suggestFn = useServerFn(suggestFollowups);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setToken(data.session?.access_token ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setToken(s?.access_token ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  const { data: doc, isLoading } = useQuery({
    queryKey: ["document", documentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documents")
        .select("id, title, status, page_count, error, insights, summary_cache, file_path")
        .eq("id", documentId)
        .single();
      if (error) throw error;
      return data;
    },
    refetchInterval: (q) => {
      const d = q.state.data as { status: string } | undefined;
      return d && (d.status === "processing" || d.status === "pending") ? 2000 : false;
    },
  });

  const { data: session } = useQuery({
    queryKey: ["chat-session", documentId],
    enabled: !!token,
    queryFn: () => getOrCreateFn({ data: { documentId } }),
  });
  const sessionId = session?.sessionId;

  const { data: history } = useQuery({
    queryKey: ["chat-history", sessionId],
    enabled: !!sessionId,
    queryFn: () => listFn({ data: { sessionId: sessionId! } }),
  });

  const { messages, sendMessage, status, setMessages } = useChat({
    id: documentId,
    transport: new DefaultChatTransport({
      api: "/api/chat",
      headers: () => (token ? { Authorization: `Bearer ${token}` } : ({} as Record<string, string>)),
      body: { documentId },
    }),
    onError: (err) => toast.error(err.message ?? "Chat failed"),
  });

  const hydratedRef = useRef(false);
  useEffect(() => {
    if (hydratedRef.current || !history?.messages) return;
    hydratedRef.current = true;
    if (history.messages.length === 0) return;
    const seeded: UIMessage[] = history.messages.map((row) => ({
      id: row.id,
      role: row.role as "user" | "assistant",
      parts: [{ type: "text", text: row.content }],
    }));
    seeded.forEach((m) => persistedIdsRef.current.add(m.id));
    setMessages(seeded);
  }, [history, setMessages]);

  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = status;
    if (!sessionId) return;
    if (prev === "streaming" && status === "ready") {
      messages.forEach((m) => {
        if (persistedIdsRef.current.has(m.id)) return;
        const content = textOf(m).trim();
        if (!content) return;
        persistedIdsRef.current.add(m.id);
        persistFn({ data: { sessionId, role: m.role as "user" | "assistant", content } }).catch(
          () => persistedIdsRef.current.delete(m.id),
        );
      });

      const lastUser = [...messages].reverse().find((m) => m.role === "user");
      const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
      if (lastAssistant) {
        setLoadingFollowups(true);
        suggestFn({
          data: {
            documentId,
            lastUser: lastUser ? textOf(lastUser).slice(0, 4000) : undefined,
            lastAssistant: textOf(lastAssistant).slice(0, 8000),
          },
        })
          .then((r) => setFollowups(r.suggestions ?? []))
          .catch(() => setFollowups([]))
          .finally(() => setLoadingFollowups(false));
      }
    }
  }, [status, messages, sessionId, persistFn, suggestFn, documentId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, status]);

  const busy = status === "submitted" || status === "streaming";
  const ready = doc?.status === "ready";

  async function submitText(text: string) {
    const clean = text.trim();
    if (!clean || busy || !ready) return;
    setInput("");
    setFollowups([]);
    if (sessionId) {
      const tempId = `user-${crypto.randomUUID()}`;
      persistedIdsRef.current.add(tempId);
      persistFn({ data: { sessionId, role: "user", content: clean } }).catch(() =>
        persistedIdsRef.current.delete(tempId),
      );
    }
    await sendMessage({ text: clean }, { body: { documentId, researchMode } });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    await submitText(input);
  }

  async function onClearConversation() {
    if (!sessionId) return;
    if (!confirm("Clear this conversation? This cannot be undone.")) return;
    try {
      await clearFn({ data: { sessionId } });
      persistedIdsRef.current = new Set();
      setMessages([]);
      setFollowups([]);
      toast.success("Conversation cleared");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not clear");
    }
  }

  const suggestions = useMemo(
    () => [
      "Summarize this document in 5 bullet points",
      "What are the key conclusions?",
      "Explain the methodology in simple terms",
    ],
    [],
  );


  return (
    <>
      <header className="h-16 border-b border-border flex items-center justify-between px-6 bg-background/50 backdrop-blur-xl sticky top-0 z-10">
        <div className="flex items-center gap-3 min-w-0">
          <Button asChild variant="ghost" size="sm">
            <Link to="/dashboard"><ArrowLeft className="size-4" /></Link>
          </Button>
          <div
            className="size-9 rounded-xl flex items-center justify-center shrink-0"
            style={{
              background: "color-mix(in oklch, var(--brand-purple) 14%, transparent)",
              boxShadow: "inset 0 0 0 1px color-mix(in oklch, var(--brand-purple) 35%, transparent)",
            }}
          >
            <FileText className="size-4" style={{ color: "var(--brand-purple-glow)" }} />
          </div>
          <div className="min-w-0">
            <h1 className="font-display font-semibold text-base truncate">{doc?.title ?? "Loading…"}</h1>
            <p className="text-xs text-muted-foreground">
              {doc?.status === "ready" ? `${doc.page_count ?? "?"} pages · ready` :
               doc?.status === "processing" ? "Indexing with AI…" :
               doc?.status === "failed" ? "Indexing failed" :
               doc?.status === "pending" ? "Pending…" : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {ready && messages.length > 0 && (
            <Button variant="ghost" size="sm" onClick={onClearConversation} title="Clear conversation">
              <Trash2 className="size-4" />
            </Button>
          )}
          {ready && (
            <Suspense fallback={null}>
              <ExportMenu
                data={{
                  title: doc?.title ?? "document",
                  chat: messages.map((m) => ({
                    role: m.role,
                    text: textOf(m),
                  })),
                  summaries: (doc as { summary_cache?: Record<string, string> } | undefined)?.summary_cache ?? {},
                  insights: (doc as { insights?: unknown } | undefined)?.insights,
                }}
              />
            </Suspense>
          )}
        </div>

      </header>

      <main className="flex-1 flex flex-col min-h-0">
        <Tabs defaultValue="chat" className="flex-1 flex flex-col min-h-0">
          <div className="border-b border-border bg-background/50 backdrop-blur-xl px-4 sm:px-8 pt-3">
            <TabsList className="bg-transparent">
              <TabsTrigger value="chat"><MessageSquare className="size-4 mr-1.5" /> Chat</TabsTrigger>
              <TabsTrigger value="viewer"><BookMarked className="size-4 mr-1.5" /> Viewer</TabsTrigger>
              <TabsTrigger value="summaries"><BookOpen className="size-4 mr-1.5" /> Summaries</TabsTrigger>
              <TabsTrigger value="insights"><Brain className="size-4 mr-1.5" /> Insights</TabsTrigger>
              <TabsTrigger value="intelligence"><Wand2 className="size-4 mr-1.5" /> Intelligence</TabsTrigger>
              <TabsTrigger value="study"><GraduationCap className="size-4 mr-1.5" /> Study</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="chat" className="flex-1 flex flex-col min-h-0 m-0">
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 sm:px-8 py-8">
              <div className="max-w-3xl mx-auto space-y-6">
                {isLoading && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" /> Loading document…
                  </div>
                )}

                {doc?.status === "failed" && (
                  <div className="glass rounded-2xl p-5 flex items-start gap-3">
                    <AlertCircle className="size-5 text-destructive mt-0.5" />
                    <div className="text-sm">
                      <p className="font-medium">We couldn't index this document.</p>
                      <p className="text-muted-foreground mt-1">{doc.error ?? "Unknown error."}</p>
                    </div>
                  </div>
                )}

                {(doc?.status === "processing" || doc?.status === "pending") && (
                  <div className="glass rounded-2xl p-5 flex items-center gap-3">
                    <Loader2 className="size-4 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">Indexing your document with AI. This usually takes a few seconds…</p>
                  </div>
                )}

                {(doc?.status === "failed" || doc?.status === "cancelled" || doc?.status === "processing") && (
                  <IngestionLog documentId={documentId} limit={10} title="Ingestion activity" />
                )}

                {ready && messages.length === 0 && (
                  <div className="text-center py-12">
                    <div className="inline-flex size-14 items-center justify-center rounded-2xl bg-gradient-primary shadow-glow-purple mb-4">
                      <Sparkles className="size-6 text-primary-foreground" />
                    </div>
                    <h2 className="text-2xl font-display font-bold">Ask anything about this PDF</h2>
                    <p className="text-sm text-muted-foreground mt-2">Answers are grounded in the document with page citations.</p>
                    <div className="mt-6 flex flex-wrap gap-2 justify-center">
                      {suggestions.map((s) => (
                        <button
                          key={s}
                          onClick={() => submitText(s)}
                          className="glass rounded-full px-4 py-2 text-xs hover:bg-card/80 transition-colors"
                        >
                          {s}
                        </button>
                      ))}
                    </div>

                  </div>
                )}

                {messages.map((m) => {
                  const text = m.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
                  const isUser = m.role === "user";
                  return (
                    <div key={m.id} className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}>
                      {!isUser && (
                        <div className="size-8 shrink-0 rounded-lg bg-gradient-primary flex items-center justify-center shadow-glow-purple">
                          <Sparkles className="size-4 text-primary-foreground" />
                        </div>
                      )}
                      <div className={`rounded-2xl px-4 py-3 max-w-[80%] ${
                        isUser
                          ? "bg-gradient-primary text-primary-foreground"
                          : "glass text-foreground"
                      }`}>
                        {isUser ? (
                          <p className="text-sm whitespace-pre-wrap">{text}</p>
                        ) : (
                          <div className="prose prose-sm max-w-none prose-p:my-2 prose-headings:mt-3 prose-headings:mb-2 prose-ul:my-2 prose-ol:my-2">
                            <LazyMarkdown>{text || "…"}</LazyMarkdown>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {status === "submitted" && (
                  <div className="flex gap-3">
                    <div className="size-8 shrink-0 rounded-lg bg-gradient-primary flex items-center justify-center">
                      <Sparkles className="size-4 text-primary-foreground" />
                    </div>
                    <div className="glass rounded-2xl px-4 py-3">
                      <Loader2 className="size-4 animate-spin text-muted-foreground" />
                    </div>
                  </div>
                )}

                {ready && !busy && (followups.length > 0 || loadingFollowups) && (
                  <div className="pl-11">
                    <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
                      <Wand2 className="size-3" /> Suggested follow-ups
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {loadingFollowups && followups.length === 0 ? (
                        <div className="glass rounded-full px-3 py-1.5 text-xs text-muted-foreground animate-pulse">
                          Thinking of next questions…
                        </div>
                      ) : (
                        followups.map((f) => (
                          <button
                            key={f}
                            onClick={() => submitText(f)}
                            className="glass rounded-full px-3 py-1.5 text-xs hover:bg-card/80 transition-colors text-left"
                          >
                            {f}
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}

              </div>
            </div>

            <div className="border-t border-border bg-background/60 backdrop-blur-xl p-4">
              <div className="max-w-3xl mx-auto">
                <div className="flex items-center justify-end gap-2 mb-2 text-xs text-muted-foreground">
                  <FlaskConical className="size-3.5" />
                  <label htmlFor="research-mode" className="cursor-pointer select-none">Research Mode</label>
                  <Switch id="research-mode" checked={researchMode} onCheckedChange={setResearchMode} />
                </div>
                <form onSubmit={onSubmit} className="flex items-center gap-2">
                  <div className="flex-1 relative">
                    <input
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder={ready ? (researchMode ? "Ask a research question…" : "Ask anything about this document…") : "Waiting for indexing…"}
                      disabled={!ready || busy}
                      className="w-full h-12 px-4 pr-12 rounded-2xl glass-strong text-sm outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50"
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={!ready || busy || !input.trim()}
                    className="h-12 w-12 p-0 bg-gradient-primary text-primary-foreground hover:opacity-90 shadow-glow-purple"
                  >
                    {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                  </Button>
                </form>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="viewer" className="flex-1 min-h-0 m-0 p-4 sm:p-6">
            {doc?.file_path ? (
              <Suspense fallback={<PanelFallback />}>
                <PdfViewer documentId={documentId} filePath={doc.file_path} />
              </Suspense>
            ) : (
              <PanelFallback />
            )}
          </TabsContent>



          <TabsContent value="summaries" className="flex-1 overflow-y-auto px-4 sm:px-8 py-8 m-0">
            <div className="max-w-3xl mx-auto">
              <Suspense fallback={<PanelFallback />}>
                <SummariesPanel documentId={documentId} ready={ready} />
              </Suspense>
            </div>
          </TabsContent>

          <TabsContent value="insights" className="flex-1 overflow-y-auto px-4 sm:px-8 py-8 m-0">
            <div className="max-w-4xl mx-auto">
              <Suspense fallback={<PanelFallback />}>
                <InsightsPanel
                  documentId={documentId}
                  ready={ready}
                  initial={(doc as { insights?: unknown } | undefined)?.insights as never}
                />
              </Suspense>
            </div>
          </TabsContent>

          <TabsContent value="intelligence" className="flex-1 overflow-y-auto px-4 sm:px-8 py-8 m-0">
            <div className="max-w-4xl mx-auto">
              <Suspense fallback={<PanelFallback />}>
                <IntelligencePanel documentId={documentId} ready={ready} />
              </Suspense>
            </div>
          </TabsContent>

          <TabsContent value="study" className="flex-1 overflow-y-auto px-4 sm:px-8 py-8 m-0">
            <div className="max-w-3xl mx-auto">
              <Suspense fallback={<PanelFallback />}>
                <StudyPanel documentId={documentId} ready={ready} />
              </Suspense>
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </>
  );
}

function PanelFallback() {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground py-8">
      <Loader2 className="size-4 animate-spin" /> Loading…
    </div>
  );
}
