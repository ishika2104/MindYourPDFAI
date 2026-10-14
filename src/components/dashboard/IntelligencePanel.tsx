import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Wand2,
  Loader2,
  Table2,
  Bot,
  Download,
  FileSearch,
  Play,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { LazyMarkdown } from "@/components/dashboard/LazyMarkdown";
import {
  analyzeTemplate,
  extractTables,
  runAgent,
  TEMPLATE_KINDS,
  type TemplateKind,
  type ExtractedTable,
  type AgentStep,
} from "@/lib/intelligence-extra.functions";

const TEMPLATE_LABELS: Record<TemplateKind, string> = {
  resume: "Resume / CV",
  contract: "Contract",
  invoice: "Invoice",
  legal: "Legal brief",
  research: "Research paper",
  financial: "Financial report",
};

function toCsv(table: ExtractedTable) {
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  return [table.headers.map(esc).join(","), ...table.rows.map((r) => r.map(esc).join(","))].join("\n");
}

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function IntelligencePanel({ documentId, ready }: { documentId: string; ready: boolean }) {
  const [section, setSection] = useState<"templates" | "tables" | "agent">("templates");
  const [kind, setKind] = useState<TemplateKind>("resume");
  const [goal, setGoal] = useState("");

  const runTemplate = useServerFn(analyzeTemplate);
  const runTables = useServerFn(extractTables);
  const runAgentFn = useServerFn(runAgent);

  const template = useMutation({
    mutationFn: async (k: TemplateKind) => (await runTemplate({ data: { documentId, kind: k } })).markdown,
    onError: (e: Error) => toast.error(e.message ?? "Analysis failed"),
  });
  const tables = useMutation({
    mutationFn: async () => (await runTables({ data: { documentId } })).tables as ExtractedTable[],
    onError: (e: Error) => toast.error(e.message ?? "Extraction failed"),
  });
  const agent = useMutation({
    mutationFn: async (g: string) =>
      (await runAgentFn({ data: { documentId, goal: g } })) as { steps: AgentStep[]; answer: string },
    onError: (e: Error) => toast.error(e.message ?? "Agent run failed"),
  });

  if (!ready) {
    return (
      <p className="text-sm text-muted-foreground glass rounded-2xl p-4">
        AI intelligence unlocks once indexing finishes.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Wand2 className="size-4 text-primary" />
        <h3 className="font-display font-semibold">AI intelligence</h3>
      </div>

      <div className="flex flex-wrap gap-2">
        <SectionTab active={section === "templates"} onClick={() => setSection("templates")} icon={<FileSearch className="size-3.5" />} label="Templates" />
        <SectionTab active={section === "tables"} onClick={() => setSection("tables")} icon={<Table2 className="size-3.5" />} label="Tables & data" />
        <SectionTab active={section === "agent"} onClick={() => setSection("agent")} icon={<Bot className="size-3.5" />} label="Agent mode" />
      </div>

      {section === "templates" && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {TEMPLATE_KINDS.map((k) => (
              <button
                key={k}
                onClick={() => setKind(k)}
                className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors border ${
                  kind === k
                    ? "bg-primary text-primary-foreground border-transparent"
                    : "glass border-border/60 text-muted-foreground hover:text-foreground"
                }`}
              >
                {TEMPLATE_LABELS[k]}
              </button>
            ))}
          </div>
          <Button size="sm" onClick={() => template.mutate(kind)} disabled={template.isPending}>
            {template.isPending ? <Loader2 className="size-3.5 mr-1.5 animate-spin" /> : <Play className="size-3.5 mr-1.5" />}
            Analyze as {TEMPLATE_LABELS[kind]}
          </Button>
          {template.data && (
            <div className="glass rounded-2xl p-5">
              <LazyMarkdown>{template.data}</LazyMarkdown>
              <Button
                size="sm"
                variant="ghost"
                className="mt-3"
                onClick={() => download(`${kind}-analysis.md`, template.data!, "text/markdown")}
              >
                <Download className="size-3.5 mr-1.5" /> Download markdown
              </Button>
            </div>
          )}
        </div>
      )}

      {section === "tables" && (
        <div className="space-y-4">
          <Button size="sm" onClick={() => tables.mutate()} disabled={tables.isPending}>
            {tables.isPending ? <Loader2 className="size-3.5 mr-1.5 animate-spin" /> : <Table2 className="size-3.5 mr-1.5" />}
            Extract tables & chart data
          </Button>
          {tables.data?.length === 0 && (
            <p className="text-sm text-muted-foreground glass rounded-2xl p-4">No tabular data found in this document.</p>
          )}
          {tables.data?.map((t, i) => (
            <div key={i} className="glass rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-sm">{t.title}</p>
                  {t.page > 0 && <p className="text-xs text-muted-foreground">Page {t.page}</p>}
                </div>
                <Button size="sm" variant="ghost" onClick={() => download(`${t.title.replace(/\W+/g, "-")}.csv`, toCsv(t), "text/csv")}>
                  <Download className="size-3.5 mr-1.5" /> CSV
                </Button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr>
                      {t.headers.map((h, hi) => (
                        <th key={hi} className="text-left font-medium px-2 py-1.5 border-b border-border/60">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {t.rows.map((r, ri) => (
                      <tr key={ri} className="odd:bg-foreground/[0.03]">
                        {r.map((c, ci) => (
                          <td key={ci} className="px-2 py-1.5 align-top text-muted-foreground">{c}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {section === "agent" && (
        <div className="space-y-4">
          <div className="glass rounded-2xl p-4 space-y-3">
            <label htmlFor="agent-goal" className="text-sm font-medium">
              Give the agent a goal
            </label>
            <textarea
              id="agent-goal"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              rows={3}
              placeholder="e.g. Find every deadline and obligation, then draft a compliance checklist"
              className="w-full resize-none rounded-xl bg-background/60 border border-border/60 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
            />
            <Button size="sm" onClick={() => agent.mutate(goal.trim())} disabled={agent.isPending || goal.trim().length < 3}>
              {agent.isPending ? <Loader2 className="size-3.5 mr-1.5 animate-spin" /> : <Bot className="size-3.5 mr-1.5" />}
              Run agent
            </Button>
          </div>

          {agent.isPending && (
            <p className="text-sm text-muted-foreground glass rounded-2xl p-4 flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" /> Planning steps, retrieving passages, synthesizing…
            </p>
          )}

          {agent.data && (
            <div className="space-y-3">
              {agent.data.steps.map((s, i) => (
                <details key={i} className="glass rounded-2xl p-4">
                  <summary className="cursor-pointer text-sm font-medium">
                    Step {i + 1}: {s.query}
                  </summary>
                  <div className="mt-3 text-sm">
                    <LazyMarkdown>{s.finding}</LazyMarkdown>
                  </div>
                </details>
              ))}
              <div className="glass rounded-2xl p-5">
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Final answer</p>
                <LazyMarkdown>{agent.data.answer}</LazyMarkdown>
                <Button size="sm" variant="ghost" className="mt-3" onClick={() => download("agent-report.md", agent.data!.answer, "text/markdown")}>
                  <Download className="size-3.5 mr-1.5" /> Download report
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SectionTab({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium border transition-colors ${
        active ? "bg-primary text-primary-foreground border-transparent" : "glass border-border/60 text-muted-foreground hover:text-foreground"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
