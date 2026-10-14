import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const STUDY_KINDS = ["flashcards", "mcq", "true_false", "short_answer"] as const;
export type StudyKind = (typeof STUDY_KINDS)[number];

const Input = z.object({
  documentId: z.string().uuid(),
  kind: z.enum(STUDY_KINDS),
  count: z.number().int().min(3).max(20).optional(),
  difficulty: z.enum(["easy", "medium", "hard"]).optional(),
});

const PROMPTS: Record<StudyKind, (n: number, d: string) => string> = {
  flashcards: (n, d) =>
    `Create ${n} ${d} flashcards from the document. Return JSON array of objects with keys "front" (question or term) and "back" (concise answer or definition).`,
  mcq: (n, d) =>
    `Create ${n} ${d} multiple-choice questions from the document. Return JSON array with keys "question", "options" (exactly 4 strings), "answer_index" (0-3), and "explanation".`,
  true_false: (n, d) =>
    `Create ${n} ${d} true/false statements from the document. Return JSON array with keys "statement", "answer" (true|false) and "explanation".`,
  short_answer: (n, d) =>
    `Create ${n} ${d} short-answer questions from the document. Return JSON array with keys "question" and "model_answer" (2-3 sentences).`,
};

async function loadText(
  supabase: { from: (t: string) => any },
  documentId: string,
  userId: string,
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

  let out = `Title: ${doc.title}\n\n`;
  const budget = 50_000;
  for (const c of (chunks ?? []) as { content: string; page: number }[]) {
    const piece = `[p${c.page}] ${c.content}\n`;
    if (out.length + piece.length > budget) break;
    out += piece;
  }
  return out;
}

export const generateStudyItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("Missing LOVABLE_API_KEY");

    const text = await loadText(supabase as never, data.documentId, userId);
    const count = data.count ?? 8;
    const difficulty = data.difficulty ?? "medium";
    const prompt = PROMPTS[data.kind](count, difficulty);

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content:
              "You generate study materials strictly grounded in the provided document. Output ONLY minified JSON — no prose, no code fences.",
          },
          { role: "user", content: `${prompt}\n\n---DOCUMENT---\n${text}` },
        ],
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      if (res.status === 429) throw new Error("AI rate limit reached. Please retry shortly.");
      if (res.status === 402) throw new Error("AI credits exhausted. Please add credits.");
      throw new Error(`AI failed: ${res.status} ${t.slice(0, 200)}`);
    }
    const json = (await res.json()) as { choices: { message: { content: string } }[] };
    const raw = json.choices?.[0]?.message?.content?.trim() ?? "[]";
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();

    let items: unknown[];
    try {
      const parsed = JSON.parse(cleaned);
      items = Array.isArray(parsed) ? parsed : Array.isArray((parsed as { items?: unknown[] }).items) ? (parsed as { items: unknown[] }).items : [];
    } catch {
      throw new Error("AI returned malformed items. Please retry.");
    }

    // Persist as one study_items row per generation (best-effort)
    await supabase
      .from("study_items")
      .insert({
        user_id: userId,
        document_id: data.documentId,
        kind: data.kind,
        difficulty,
        payload: items as never,
      })
      .then(() => undefined, () => undefined);

    return { items: items as never, kind: data.kind, difficulty };
  });
