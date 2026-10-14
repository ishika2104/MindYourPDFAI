import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createEmbeddings } from "@/lib/ai-gateway.server";

const Input = z.object({
  query: z.string().trim().min(2).max(500),
  documentIds: z.array(z.string().uuid()).max(20).optional(),
  limit: z.number().int().min(1).max(30).optional(),
});

export const crossDocumentSearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("Missing LOVABLE_API_KEY");

    const [embedding] = await createEmbeddings(apiKey, [data.query]);

    const { data: matches, error } = await supabase.rpc("match_all_chunks", {
      query_embedding: `[${embedding.join(",")}]` as unknown as string,
      match_user_id: userId,
      match_count: data.limit ?? 12,
      filter_document_ids: data.documentIds ?? undefined,
    });
    if (error) throw new Error(error.message);


    const rows = (matches ?? []) as {
      id: string;
      document_id: string;
      content: string;
      page: number | null;
      chunk_index: number;
      similarity: number;
    }[];

    const docIds = Array.from(new Set(rows.map((r) => r.document_id)));
    let titleMap: Record<string, string> = {};
    if (docIds.length > 0) {
      const { data: docs } = await supabase
        .from("documents")
        .select("id, title")
        .in("id", docIds);
      titleMap = Object.fromEntries((docs ?? []).map((d) => [d.id, d.title]));
    }

    // Best-effort history log
    await supabase
      .from("search_history")
      .insert({ user_id: userId, query: data.query, result_count: rows.length })
      .then(() => undefined, () => undefined);

    return {
      results: rows.map((r) => ({
        id: r.id,
        documentId: r.document_id,
        documentTitle: titleMap[r.document_id] ?? "Untitled",
        page: r.page,
        content: r.content,
        similarity: r.similarity,
      })),
    };
  });

const FavoriteInput = z.object({
  documentId: z.string().uuid(),
  favorite: z.boolean(),
});

export const toggleFavorite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => FavoriteInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("documents")
      .update({ favorite: data.favorite })
      .eq("id", data.documentId)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
