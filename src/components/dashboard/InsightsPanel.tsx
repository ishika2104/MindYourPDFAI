import { useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Brain, Loader2, RefreshCw, Lightbulb, Tags, Users, Building2, Cpu, Calendar, ListChecks, AlertTriangle, Compass, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { generateInsights } from "@/lib/intelligence.functions";

type Insights = {
  executive_summary?: string;
  key_takeaways?: string[];
  important_concepts?: string[];
  keywords?: string[];
  entities?: { people?: string[]; organizations?: string[]; technologies?: string[]; places?: string[] };
  important_dates?: { date: string; event: string }[];
  action_items?: string[];
  risks?: string[];
  recommendations?: string[];
  faqs?: { q: string; a: string }[];
};

export function InsightsPanel({
  documentId,
  ready,
  initial,
}: {
  documentId: string;
  ready: boolean;
  initial?: Insights | null;
}) {
  const run = useServerFn(generateInsights);
  const mut = useMutation({
    mutationFn: async (force?: boolean) =>
      (await run({ data: { documentId, force } })).insights as Insights,
    onError: (err: Error) => toast.error(err.message ?? "Insights failed"),
  });

  useEffect(() => {
    if (ready && !initial && !mut.data && !mut.isPending) mut.mutate(undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, initial]);

  const data = mut.data ?? initial ?? null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain className="size-4 text-primary" />
          <h3 className="font-display font-semibold">AI insights</h3>
        </div>
        {data && (
          <Button size="sm" variant="ghost" onClick={() => mut.mutate(true)} disabled={mut.isPending}>
            <RefreshCw className="size-3.5 mr-1" /> Regenerate
          </Button>
        )}
      </div>

      {!ready && <p className="text-sm text-muted-foreground glass rounded-2xl p-4">Insights generate automatically once indexing finishes.</p>}

      {ready && mut.isPending && !data && (
        <div className="glass rounded-2xl p-5 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Reading the whole document and extracting insights…
        </div>
      )}

      {data && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {data.executive_summary && (
            <Card icon={<Lightbulb className="size-4" />} title="Executive summary" className="md:col-span-2">
              <p className="text-sm leading-relaxed">{data.executive_summary}</p>
            </Card>
          )}
          {data.key_takeaways?.length ? (
            <Card icon={<Lightbulb className="size-4" />} title="Key takeaways">
              <BulletList items={data.key_takeaways} />
            </Card>
          ) : null}
          {data.important_concepts?.length ? (
            <Card icon={<Compass className="size-4" />} title="Important concepts">
              <BulletList items={data.important_concepts} />
            </Card>
          ) : null}
          {data.keywords?.length ? (
            <Card icon={<Tags className="size-4" />} title="Keywords">
              <ChipList items={data.keywords} />
            </Card>
          ) : null}
          {data.entities?.people?.length ? (
            <Card icon={<Users className="size-4" />} title="People">
              <ChipList items={data.entities.people} />
            </Card>
          ) : null}
          {data.entities?.organizations?.length ? (
            <Card icon={<Building2 className="size-4" />} title="Organizations">
              <ChipList items={data.entities.organizations} />
            </Card>
          ) : null}
          {data.entities?.technologies?.length ? (
            <Card icon={<Cpu className="size-4" />} title="Technologies">
              <ChipList items={data.entities.technologies} />
            </Card>
          ) : null}
          {data.important_dates?.length ? (
            <Card icon={<Calendar className="size-4" />} title="Important dates">
              <ul className="space-y-1.5 text-sm">
                {data.important_dates.map((d, i) => (
                  <li key={i}><span className="font-medium">{d.date}</span> — <span className="text-muted-foreground">{d.event}</span></li>
                ))}
              </ul>
            </Card>
          ) : null}
          {data.action_items?.length ? (
            <Card icon={<ListChecks className="size-4" />} title="Action items">
              <BulletList items={data.action_items} />
            </Card>
          ) : null}
          {data.risks?.length ? (
            <Card icon={<AlertTriangle className="size-4" />} title="Risks">
              <BulletList items={data.risks} />
            </Card>
          ) : null}
          {data.recommendations?.length ? (
            <Card icon={<Compass className="size-4" />} title="Recommendations">
              <BulletList items={data.recommendations} />
            </Card>
          ) : null}
          {data.faqs?.length ? (
            <Card icon={<HelpCircle className="size-4" />} title="FAQs" className="md:col-span-2">
              <ul className="space-y-3 text-sm">
                {data.faqs.map((f, i) => (
                  <li key={i}>
                    <p className="font-medium">{f.q}</p>
                    <p className="text-muted-foreground mt-0.5">{f.a}</p>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      )}
    </div>
  );
}

function Card({ icon, title, children, className }: { icon: React.ReactNode; title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`glass rounded-2xl p-4 ${className ?? ""}`}>
      <div className="flex items-center gap-2 mb-2 text-primary">
        {icon}
        <h4 className="text-xs uppercase tracking-wider font-semibold">{title}</h4>
      </div>
      {children}
    </div>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1.5 text-sm list-disc pl-4">
      {items.map((it, i) => <li key={i}>{it}</li>)}
    </ul>
  );
}

function ChipList({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((it, i) => (
        <span key={i} className="text-xs px-2 py-1 rounded-full glass-strong">{it}</span>
      ))}
    </div>
  );
}
