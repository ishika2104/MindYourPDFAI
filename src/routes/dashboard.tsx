import { createFileRoute, Outlet, useNavigate, Link, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  LayoutDashboard, FileText, Settings, LogOut, Loader2, Plus, Search, Repeat, BarChart3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { User } from "@supabase/supabase-js";
import iconUrl from "@/assets/mypdf-icon.png";
import { CommandPalette } from "@/components/dashboard/CommandPalette";

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — mypdf :MindYourPDF AI" }] }),
  component: DashboardLayout,
});

function DashboardLayout() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
      if (!session) navigate({ to: "/auth", replace: true });
    });
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) navigate({ to: "/auth", replace: true });
      else setUser(data.session.user);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  const params = useParams({ strict: false }) as { documentId?: string };
  const activeDocId = params.documentId;

  const { data: docs = [] } = useQuery({
    queryKey: ["documents", user?.id],
    enabled: !!user,
    refetchInterval: (q) => {
      const list = q.state.data as { status: string }[] | undefined;
      return list?.some((d) => d.status === "processing" || d.status === "pending") ? 2000 : false;
    },
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documents")
        .select("id, title, status, page_count, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  async function handleSignOut() {
    await supabase.auth.signOut();
    toast.success("Signed out");
    navigate({ to: "/auth", replace: true });
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!user) return null;

  return (
    <div className="min-h-screen flex">
      <aside className="hidden lg:flex flex-col w-72 shrink-0 border-r border-border bg-card/40 backdrop-blur-xl">
        <Link to="/" className="flex items-center gap-2 px-5 h-16 border-b border-border group">
          <img
            src={iconUrl}
            alt="mypdf logo"
            width={32}
            height={32}
            className="size-8 drop-shadow-[0_4px_10px_rgba(168,85,247,0.45)] group-hover:animate-wiggle"
          />
          <span className="font-display font-bold tracking-tight text-sm">
            mypdf<span className="text-purple"> :MindYourPDF</span> AI
          </span>
        </Link>

        <div className="px-3 pt-4">
          <Button asChild className="w-full h-10 bg-gradient-primary text-primary-foreground hover:opacity-90 shadow-glow-purple">
            <Link to="/dashboard">
              <Plus className="size-4 mr-2" /> New upload
            </Link>
          </Button>
        </div>

        <nav className="px-3 py-4 space-y-0.5">
          <Link
            to="/dashboard"
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
              !activeDocId
                ? "bg-primary/10 text-foreground ring-1 ring-primary/20"
                : "text-muted-foreground hover:bg-card hover:text-foreground"
            }`}
          >
            <LayoutDashboard className="size-4" /> Overview
          </Link>
          <Link
            to="/dashboard/search"
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors text-muted-foreground hover:bg-card hover:text-foreground"
            activeProps={{ className: "!bg-primary/10 !text-foreground ring-1 ring-primary/20" }}
          >
            <Search className="size-4" /> Search all PDFs
            <kbd className="ml-auto text-[10px] font-mono text-muted-foreground/70 border border-border rounded px-1.5 py-0.5">⌘K</kbd>
          </Link>
          <Link
            to="/dashboard/convert"
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors text-muted-foreground hover:bg-card hover:text-foreground"
            activeProps={{ className: "!bg-primary/10 !text-foreground ring-1 ring-primary/20" }}
          >
            <Repeat className="size-4" /> Convert files
          </Link>
          <Link
            to="/dashboard/analytics"
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors text-muted-foreground hover:bg-card hover:text-foreground"
            activeProps={{ className: "!bg-primary/10 !text-foreground ring-1 ring-primary/20" }}
          >
            <BarChart3 className="size-4" /> Analytics
          </Link>
        </nav>

        <div className="px-5 pb-2 pt-2 text-[11px] uppercase tracking-wider text-muted-foreground">
          My documents
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-0.5">
          {docs.length === 0 && (
            <p className="px-3 py-2 text-xs text-muted-foreground">No documents yet.</p>
          )}
          {docs.map((d) => (
            <Link
              key={d.id}
              to="/dashboard/$documentId"
              params={{ documentId: d.id }}
              className={`group flex items-start gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                activeDocId === d.id
                  ? "bg-primary/10 text-foreground ring-1 ring-primary/20"
                  : "text-muted-foreground hover:bg-card hover:text-foreground"
              }`}
            >
              <FileText className="size-4 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="truncate text-foreground/90">{d.title}</p>
                <p className="text-[10px] text-muted-foreground">
                  {d.status === "ready"
                    ? `${d.page_count ?? "?"} pages`
                    : d.status === "failed"
                      ? "Failed"
                      : d.status === "processing"
                        ? "Indexing…"
                        : "Pending"}
                </p>
              </div>
              {(d.status === "processing" || d.status === "pending") && (
                <Loader2 className="size-3 animate-spin" />
              )}
            </Link>
          ))}
        </div>

        <div className="p-3 border-t border-border">
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="size-8 rounded-full bg-gradient-primary flex items-center justify-center text-xs font-semibold text-primary-foreground">
              {user.email?.[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate">{user.email}</p>
              <p className="text-[10px] text-muted-foreground">Free plan</p>
            </div>
            <button onClick={handleSignOut} className="p-1.5 rounded-md hover:bg-card text-muted-foreground hover:text-foreground" aria-label="Sign out" title="Sign out">
              <Settings className="size-4 hidden" />
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <Outlet />
      </div>
      <CommandPalette />
    </div>
  );
}
