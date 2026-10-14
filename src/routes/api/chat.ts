import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  createEmbeddings,
  createLovableAiGatewayProvider,
} from "@/lib/ai-gateway.server";

const BodySchema = z.object({
  documentId: z.string().uuid().optional(),
  documentIds: z.array(z.string().uuid()).min(1).max(10).optional(),
  researchMode: z.boolean().optional(),
  messages: z
    .array(z.object({ role: z.string() }).passthrough())
    .min(1)
    .max(50),
});

// Naive in-memory token bucket per user (best-effort; per-worker instance).
const buckets = new Map<string, { tokens: number; ts: number }>();
function allow(userId: string, ratePerMin = 30): boolean {
  const now = Date.now();
  const b = buckets.get(userId) ?? { tokens: ratePerMin, ts: now };
  const refill = ((now - b.ts) / 60_000) * ratePerMin;
  b.tokens = Math.min(ratePerMin, b.tokens + refill);
  b.ts = now;
  if (b.tokens < 1) { buckets.set(userId, b); return false; }
  b.tokens -= 1;
  buckets.set(userId, b);
  return true;
}

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let parsed: z.infer<typeof BodySchema>;
        try {
          parsed = BodySchema.parse(await request.json());
        } catch {
          return new Response("Bad request", { status: 400 });
        }
        const { documentId, documentIds, researchMode } = parsed;
        if (!documentId && !documentIds) return new Response("documentId or documentIds required", { status: 400 });
        const messages = parsed.messages as unknown as UIMessage[];

        if (JSON.stringify(messages).length > 200_000) {
          return new Response("Payload too large", { status: 413 });
        }

        const authHeader = request.headers.get("authorization") ?? "";
        const token = authHeader.toLowerCase().startsWith("bearer ")
          ? authHeader.slice(7)
          : "";
        if (!token) return new Response("Unauthorized", { status: 401 });

        const apiKey = process.env.LOVABLE_API_KEY;
        const supabaseUrl = process.env.SUPABASE_URL!;
        const supabaseAnon = process.env.SUPABASE_PUBLISHABLE_KEY!;
        if (!apiKey) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        const supabase = createClient(supabaseUrl, supabaseAnon, {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { persistSession: false, autoRefreshToken: false },
        });

        const { data: userData, error: userErr } = await supabase.auth.getUser(token);
        if (userErr || !userData.user) return new Response("Unauthorized", { status: 401 });
        const userId = userData.user.id;

        if (!allow(userId)) {
          return new Response("Rate limit exceeded. Try again shortly.", { status: 429 });
        }

        const lastUser = [...messages].reverse().find((m) => m.role === "user");
        const userText =
          lastUser?.parts
            ?.map((p) => (p.type === "text" ? p.text : ""))
            .join(" ")
            .trim() ?? "";

        // Basic prompt-injection guard: strip obvious override directives from user text used in retrieval.
        const safeText = userText.replace(/ignore (all )?previous instructions/gi, "").slice(0, 2000);

        let contextBlock = "";
        if (safeText) {
          try {
            const [queryEmbedding] = await createEmbeddings(apiKey, [safeText]);
            const embStr = `[${queryEmbedding.join(",")}]` as unknown as number[];
            const isMulti = !!documentIds && documentIds.length > 0;
            const rpc = isMulti
              ? supabase.rpc("match_all_chunks", {
                  query_embedding: embStr,
                  match_user_id: userId,
                  match_count: 10,
                  filter_document_ids: documentIds!,
                })
              : supabase.rpc("match_document_chunks", {
                  query_embedding: embStr,
                  match_document_id: documentId!,
                  match_count: 6,
                });
            const { data: matches, error } = await rpc;
            if (error) console.error("[chat] match error", error);
            if (matches && matches.length > 0) {
              contextBlock = (matches as Array<{ page: number | null; content: string; document_id?: string }>)
                .map((m, i) => `[Source ${i + 1}${m.document_id ? ` · doc ${m.document_id.slice(0,8)}` : ""} · page ${m.page ?? "?"}]\n${m.content}`)
                .join("\n\n---\n\n");
            }
          } catch (e) {
            console.error("[chat] retrieval failed", e);
          }
        }

        const baseSystem = `You are MindYourPDF AI, a helpful assistant that answers questions strictly using the provided document excerpts.

Rules:
- Use only the SOURCES below as ground truth. If the answer isn't in the sources, say you couldn't find it in this document.
- Cite the page number inline like "(p. 3)" when you reference a source.
- Be concise but complete. Use markdown (lists, bold, headings) when it helps readability.`;

        const researchSystem = `${baseSystem}

RESEARCH MODE: Structure every substantive answer with these markdown sections when the question calls for analysis:
## Timeline
## Key Arguments
## Counter-arguments
## Limitations
## Future Work / Open Questions
Omit sections that are genuinely not addressed by the sources rather than inventing content. Always cite pages.`;

        const system = `${researchMode ? researchSystem : baseSystem}

SOURCES:
${contextBlock || "(no relevant excerpts retrieved)"}
`;

        const gateway = createLovableAiGatewayProvider(apiKey);
        const result = streamText({
          model: gateway("google/gemini-3-flash-preview"),
          system,
          messages: await convertToModelMessages(messages),
        });

        return result.toUIMessageStreamResponse({ originalMessages: messages });
      },
    },
  },
});
