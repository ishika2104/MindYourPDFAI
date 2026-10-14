import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const TEMPLATE_KINDS = [
  "resume",
  "contract",
  "invoice",
  "legal",
  "research",
  "financial",
] as const;
export type TemplateKind = (typeof TEMPLATE_KINDS)[number];

const TEMPLATE_PROMPTS: Record<TemplateKind, string> = {
  resume:
    "Analyze this document as a RESUME/CV. Produce markdown with: Candidate snapshot, Strengths, Gaps & red flags, ATS keyword coverage (table of keyword | present?), Suggested improvements (rewrite 3 bullet points), Overall score /100 with reasoning.",
  contract:
    "Analyze this document as a CONTRACT. Produce markdown with: Parties, Term & termination, Payment terms, Obligations per party, Liability & indemnity, Confidentiality/IP, Risky or unusual clauses (with quoted snippets), Missing standard clauses, Negotiation checklist.",
  invoice:
    "Analyze this document as an INVOICE/BILL. Produce markdown with: Vendor & buyer, Invoice number and dates, Line items table (item | qty | unit price | amount), Subtotal/tax/total, Payment terms and method, Discrepancies or math errors, Action items.",
  legal:
    "Analyze this document as a LEGAL BRIEF/JUDGMENT. Produce markdown with: Case identity, Parties, Facts, Issues, Rules/authorities cited, Reasoning, Holding, Implications, Plain-English explainer.",
  research:
    "Analyze this document as a RESEARCH PAPER. Produce markdown with: Problem, Prior work, Method, Dataset/experiments, Results with key numbers, Limitations, Reproducibility notes, Novelty rating /10, Related directions.",
  financial:
    "Analyze this document as a FINANCIAL REPORT. Produce markdown with: Reporting entity & period, Headline metrics table, Revenue & cost drivers, Margins and trends, Balance sheet highlights, Cash flow notes, Risks & disclosures, Analyst take.",
};

const TemplateInput = z.object({
  documentId: z.string().uuid(),
  kind: z.enum(TEMPLATE_KINDS),
});

const TablesInput = z.object({ documentId: z.string().uuid() });

const AgentInput = z.object({
  documentId: z.string().uuid(),
  goal: z.string().min(3).max(2000),
});

type SupabaseLike = { from: (t: string) => any };

async function loadChunks(supabase: SupabaseLike, documentId: string, userId: string) {
  const { data: doc, error: dErr } = await supabase
    .from("documents")
    .select("user_id, title")
    .eq("id", documentId)
    .single();
  if (dErr || !doc) throw new Error("Document not found");
  if (doc.user_id !== userId) throw new Error("Forbidden");

  const { data: chunks, error } = await supabase
    .from("document_chunks")
    .select("content, page, chunk_index")
    .eq("document_id", documentId)
    .order("chunk_index", { ascending: true });
  if (error) throw error;
  if (!chunks || chunks.length === 0) throw new Error("No indexed content yet");
  return { title: doc.title as string, chunks: chunks as { content: string; page: number }[] };
}

function joinChunks(
  title: string,
  chunks: { content: string; page: number }[],
  charBudget = 60_000,
) {
  let out = `Title: ${title}\n\n`;
  for (const c of chunks) {
    const piece = `[p${c.page}] ${c.content}\n`;
    if (out.length + piece.length > charBudget) break;
    out += piece;
  }
  return out;
}

async function callAI(apiKey: string, system: string, user: string): Promise<string> {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 429) throw new Error("AI rate limit reached. Please retry shortly.");
    if (res.status === 402) throw new Error("AI credits exhausted. Please add credits in Lovable.");
    throw new Error(`AI request failed: ${res.status} ${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as { choices: { message: { content: string } }[] };
  return json.choices?.[0]?.message?.content?.trim() ?? "";
}

function parseJson<T>(raw: string): T {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const start = cleaned.indexOf("{");
    const startArr = cleaned.indexOf("[");
    const from = start === -1 ? startArr : startArr === -1 ? start : Math.min(start, startArr);
    const end = Math.max(cleaned.lastIndexOf("}"), cleaned.lastIndexOf("]"));
    if (from !== -1 && end > from) {
      return JSON.parse(cleaned.slice(from, end + 1)) as T;
    }
    throw new Error("AI returned malformed output. Please retry.");
  }
}

/** Template-driven document analysis (resume, contract, invoice, legal, research, financial). */
export const analyzeTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => TemplateInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("Missing LOVABLE_API_KEY");

    const { title, chunks } = await loadChunks(supabase as never, data.documentId, userId);
    const markdown = await callAI(
      apiKey,
      "You are a domain expert document analyst. Ground every claim in the provided text, quote sparingly, and never invent facts. Output clean markdown only.",
      `${TEMPLATE_PROMPTS[data.kind]}\n\nIf the document is clearly not of this type, say so in one line at the top, then analyze what is actually there.\n\n---DOCUMENT---\n${joinChunks(title, chunks)}`,
    );
    return { markdown, kind: data.kind };
  });

export type ExtractedTable = { title: string; page: number; headers: string[]; rows: string[][] };

/** Extract tabular / chart data from the document as structured tables. */
export const extractTables = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => TablesInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("Missing LOVABLE_API_KEY");

    const { title, chunks } = await loadChunks(supabase as never, data.documentId, userId);
    const raw = await callAI(
      apiKey,
      "You extract tabular and chart data from documents. Output ONLY valid minified JSON. No prose, no code fences.",
      `Find every table, data listing, or chart described in the document and return them as JSON:
{"tables":[{"title":string,"page":number,"headers":string[],"rows":string[][]}]}
Rules: every row must have exactly as many cells as headers; keep numbers as written; max 12 tables; if none exist return {"tables":[]}.

---DOCUMENT---
${joinChunks(title, chunks, 45_000)}`,
    );

    const parsed = parseJson<{ tables?: ExtractedTable[] }>(raw);
    const tables = (parsed.tables ?? [])
      .filter((t) => Array.isArray(t.headers) && Array.isArray(t.rows) && t.headers.length > 0)
      .map((t) => ({
        title: String(t.title ?? "Table"),
        page: Number(t.page ?? 0) || 0,
        headers: t.headers.map((h) => String(h)),
        rows: t.rows
          .filter(Array.isArray)
          .map((r) => r.map((c) => String(c ?? "")).slice(0, t.headers.length)),
      }));
    return { tables };
  });

export type AgentStep = { tool: string; query: string; finding: string };

/** Agent mode: plans steps, retrieves relevant passages per step, then synthesises an answer. */
export const runAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => AgentInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("Missing LOVABLE_API_KEY");

    const { title, chunks } = await loadChunks(supabase as never, data.documentId, userId);
    const goal = data.goal.replace(/[\u0000-\u001f]/g, " ").slice(0, 2000);

    // 1) Plan
    const planRaw = await callAI(
      apiKey,
      "You are a planning agent working over a single document. Output ONLY valid minified JSON.",
      `Document title: ${title}
Goal: ${goal}

Break the goal into 2-4 research steps. Each step must have a short label and a keyword-rich search query for retrieving passages from the document.
Return {"steps":[{"label":string,"query":string}]}`,
    );
    const plan = parseJson<{ steps?: { label: string; query: string }[] }>(planRaw).steps ?? [];
    const steps = plan.slice(0, 4);
    if (steps.length === 0) steps.push({ label: "Research", query: goal });

    // 2) Execute each step with keyword retrieval over chunks
    const executed: AgentStep[] = [];
    for (const step of steps) {
      const terms = step.query
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((t) => t.length > 3);
      const scored = chunks
        .map((c) => {
          const lower = c.content.toLowerCase();
          const score = terms.reduce((acc, t) => acc + (lower.includes(t) ? 1 : 0), 0);
          return { c, score };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 6)
        .filter((s) => s.score > 0);
      const passages = (scored.length ? scored.map((s) => s.c) : chunks.slice(0, 6))
        .map((c) => `[p${c.page}] ${c.content}`)
        .join("\n\n")
        .slice(0, 18_000);

      const finding = await callAI(
        apiKey,
        "You are a research agent. Answer strictly from the passages. Cite pages as [p1]. If the passages do not answer, say so.",
        `Step: ${step.label}\nQuestion: ${step.query}\n\n---PASSAGES---\n${passages}`,
      );
      executed.push({ tool: "retrieve", query: step.label, finding });
    }

    // 3) Synthesize
    const answer = await callAI(
      apiKey,
      "You are a senior analyst. Synthesize the step findings into one grounded markdown answer with page citations like [p3]. Never invent facts.",
      `Goal: ${goal}\n\n---FINDINGS---\n${executed
        .map((s, i) => `### Step ${i + 1}: ${s.query}\n${s.finding}`)
        .join("\n\n")}`,
    );

    return { steps: executed, answer };
  });
