import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };
type JsonObject = { [k: string]: JsonValue };

export const SUMMARY_KINDS = ["quick", "detailed", "executive", "bullet", "academic", "business"] as const;
export type SummaryKind = (typeof SUMMARY_KINDS)[number];

const SummaryInput = z.object({
  documentId: z.string().uuid(),
  kind: z.enum(SUMMARY_KINDS),
  force: z.boolean().optional(),
});

const InsightsInput = z.object({
  documentId: z.string().uuid(),
  force: z.boolean().optional(),
});

const SUMMARY_PROMPTS: Record<SummaryKind, string> = {
  quick: "Write a quick 3-sentence summary of the following document. Plain English. No preamble.",
  detailed: "Write a thorough, multi-paragraph summary (300-500 words) of the following document. Use clear sections and markdown headings where useful.",
  executive: "Write an executive summary (5-8 bullet points) capturing the most decision-relevant insights, framed for a busy leader.",
  bullet: "Summarize the document as a tidy bulleted list of the 10 most important points. Each bullet ≤ 20 words.",
  academic: "Summarize the document in an academic register: background, methods, findings, implications, limitations. Use markdown headings.",
  business: "Summarize the document for a business audience: problem, opportunity, key metrics, recommendations, risks. Use markdown headings.",
};

async function loadDocumentText(
  supabase: { from: (t: string) => any },
  documentId: string,
  userId: string,
  charBudget = 60_000,
): Promise<string> {
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

  let out = `Title: ${doc.title}\n\n`;
  for (const c of chunks as { content: string; page: number }[]) {
    const piece = `[p${c.page}] ${c.content}\n`;
    if (out.length + piece.length > charBudget) break;
    out += piece;
  }
  return out;
}

async function callGemini(apiKey: string, system: string, user: string): Promise<string> {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey,
    },
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

export const generateSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => SummaryInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("Missing LOVABLE_API_KEY");

    if (!data.force) {
      const { data: row } = await supabase
        .from("documents")
        .select("summary_cache, user_id")
        .eq("id", data.documentId)
        .single();
      if (!row || row.user_id !== userId) throw new Error("Forbidden");
      const cache = (row.summary_cache ?? {}) as Record<string, string>;
      if (cache[data.kind]) return { summary: cache[data.kind], cached: true };
    }

    const text = await loadDocumentText(supabase as never, data.documentId, userId);
    const summary = await callGemini(
      apiKey,
      "You are an expert document summarizer. Be accurate, concise, and grounded in the provided text. Never invent facts.",
      `${SUMMARY_PROMPTS[data.kind]}\n\n---DOCUMENT---\n${text}`,
    );

    const { data: cur } = await supabase
      .from("documents")
      .select("summary_cache")
      .eq("id", data.documentId)
      .single();
    const next = { ...((cur?.summary_cache ?? {}) as Record<string, string>), [data.kind]: summary };
    await supabase.from("documents").update({ summary_cache: next }).eq("id", data.documentId);

    return { summary, cached: false };
  });

export const generateInsights = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => InsightsInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("Missing LOVABLE_API_KEY");

    if (!data.force) {
      const { data: row } = await supabase
        .from("documents")
        .select("insights, user_id")
        .eq("id", data.documentId)
        .single();
      if (!row || row.user_id !== userId) throw new Error("Forbidden");
      if (row.insights) return { insights: row.insights as JsonObject, cached: true };
    }

    const text = await loadDocumentText(supabase as never, data.documentId, userId);
    const raw = await callGemini(
      apiKey,
      "You are a senior research analyst. Extract structured insights from documents. Output ONLY valid minified JSON matching the requested schema. No prose, no code fences.",
      `Extract insights from the document. Return JSON with these keys:
{
  "executive_summary": string,
  "key_takeaways": string[],
  "important_concepts": string[],
  "keywords": string[],
  "entities": { "people": string[], "organizations": string[], "technologies": string[], "places": string[] },
  "important_dates": { "date": string, "event": string }[],
  "action_items": string[],
  "risks": string[],
  "recommendations": string[],
  "faqs": { "q": string, "a": string }[]
}
Keep arrays focused (max 10 items each). If a category has no content, return an empty array.

---DOCUMENT---
${text}`,
    );

    let insights: JsonObject;
    try {
      const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
      insights = JSON.parse(cleaned) as JsonObject;
    } catch {
      throw new Error("AI returned malformed insights. Please retry.");
    }

    await supabase.from("documents").update({ insights: insights as never }).eq("id", data.documentId);
    return { insights, cached: false };
  });
