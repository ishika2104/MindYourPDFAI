import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PageSchema = z.object({
  page: z.number().int().min(1),
  text: z.string(),
});

const IngestSchema = z.object({
  documentId: z.string().uuid(),
  pages: z.array(PageSchema).min(1).max(2000),
});

const StartSchema = z.object({
  documentId: z.string().uuid(),
  totalPages: z.number().int().min(1),
});

const ChunkSchema = z.object({
  page: z.number().int().min(1),
  content: z.string().min(1),
});

const BatchSchema = z.object({
  documentId: z.string().uuid(),
  startIndex: z.number().int().min(0),
  chunks: z.array(ChunkSchema).min(1).max(128),
});

const FinalizeSchema = z.object({
  documentId: z.string().uuid(),
  totalChunks: z.number().int().min(0),
});

const FailSchema = z.object({
  documentId: z.string().uuid(),
  message: z.string().max(500),
});

const CancelSchema = z.object({
  documentId: z.string().uuid().optional(),
  filePath: z.string().min(1).optional(),
});

/** Split a page's text into ~800-char chunks (with ~120-char overlap). */
export function chunkText(text: string, page: number, chunkSize = 800, overlap = 120) {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return [];
  const chunks: { page: number; content: string }[] = [];
  let i = 0;
  while (i < cleaned.length) {
    const end = Math.min(i + chunkSize, cleaned.length);
    let slice = cleaned.slice(i, end);
    if (end < cleaned.length) {
      const lastBreak = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf(" "));
      if (lastBreak > chunkSize * 0.5) slice = slice.slice(0, lastBreak);
    }
    chunks.push({ page, content: slice.trim() });
    if (end >= cleaned.length) break;
    i += slice.length - overlap;
    if (i < 0) i = 0;
  }
  return chunks;
}

async function assertOwnership(
  supabase: { from: (t: string) => { select: (q: string) => { eq: (k: string, v: string) => { single: () => Promise<{ data: { user_id: string } | null; error: unknown }> } } } },
  documentId: string,
  userId: string,
) {
  const { data: doc, error } = await supabase
    .from("documents")
    .select("user_id")
    .eq("id", documentId)
    .single();
  if (error || !doc) throw new Error("Document not found");
  if (doc.user_id !== userId) throw new Error("Forbidden");
}

async function logEvent(
  supabase: { from: (t: string) => { insert: (row: unknown) => Promise<{ error: unknown }> } },
  documentId: string,
  userId: string,
  event: "started" | "cancelled" | "completed" | "failed" | "progress",
  message?: string,
) {
  try {
    await supabase
      .from("ingestion_events")
      .insert({ document_id: documentId, user_id: userId, event, message: message ?? null });
  } catch {
    // logging must never break ingestion
  }
}

export const startIngestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => StartSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertOwnership(supabase as never, data.documentId, userId);
    const { error } = await supabase
      .from("documents")
      .update({ status: "processing", page_count: data.totalPages, error: null })
      .eq("id", data.documentId);
    if (error) throw error;
    await logEvent(supabase as never, data.documentId, userId, "started", `${data.totalPages} pages`);
    return { ok: true };
  });

export const embedChunkBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => BatchSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("Missing LOVABLE_API_KEY");
    await assertOwnership(supabase as never, data.documentId, userId);

    const { createEmbeddings } = await import("@/lib/ai-gateway.server");
    const embeddings = await createEmbeddings(apiKey, data.chunks.map((c) => c.content));
    const rows = data.chunks.map((c, j) => ({
      document_id: data.documentId,
      user_id: userId,
      chunk_index: data.startIndex + j,
      page: c.page,
      content: c.content,
      embedding: `[${embeddings[j].join(",")}]`,
    }));
    const { error } = await supabase.from("document_chunks").insert(rows);
    if (error) throw error;
    return { ok: true, inserted: rows.length };
  });

export const finalizeIngestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => FinalizeSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertOwnership(supabase as never, data.documentId, userId);
    const { error } = await supabase
      .from("documents")
      .update({ status: "ready" })
      .eq("id", data.documentId);
    if (error) throw error;
    await logEvent(
      supabase as never,
      data.documentId,
      userId,
      "completed",
      `${data.totalChunks} chunks indexed`,
    );
    return { ok: true, totalChunks: data.totalChunks };
  });

export const failIngestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => FailSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertOwnership(supabase as never, data.documentId, userId);
    await supabase
      .from("documents")
      .update({ status: "failed", error: data.message })
      .eq("id", data.documentId);
    await logEvent(supabase as never, data.documentId, userId, "failed", data.message);
    return { ok: true };
  });

/**
 * Cancel an in-progress ingestion: drop chunks + storage object and mark the
 * document as cancelled. The document row is kept so the event log survives
 * for troubleshooting (events cascade-delete with the document).
 */
export const cancelIngestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => CancelSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    let filePath = data.filePath;

    if (data.documentId) {
      const { data: doc } = await supabase
        .from("documents")
        .select("user_id, file_path")
        .eq("id", data.documentId)
        .single();
      if (doc && doc.user_id === userId) {
        filePath = filePath ?? doc.file_path;
        await supabase.from("document_chunks").delete().eq("document_id", data.documentId);
        await supabase
          .from("documents")
          .update({ status: "cancelled", error: "Cancelled by user" })
          .eq("id", data.documentId);
        await logEvent(supabase as never, data.documentId, userId, "cancelled", "Cancelled by user");
      } else {
        return { ok: true };
      }
    }

    if (filePath) {
      // App-layer ownership: storage paths are `<userId>/<uuid>-name.pdf`.
      const expectedPrefix = `${userId}/`;
      if (!filePath.startsWith(expectedPrefix)) {
        throw new Error("Forbidden");
      }
      await supabase.storage.from("pdfs").remove([filePath]).catch(() => {});
    }

    return { ok: true };
  });

/** Legacy single-call ingestion kept for compatibility. */
export const ingestDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => IngestSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("Missing LOVABLE_API_KEY");

    const { data: doc, error: docErr } = await supabase
      .from("documents")
      .select("id, user_id, status")
      .eq("id", data.documentId)
      .single();
    if (docErr || !doc) throw new Error("Document not found");
    if (doc.user_id !== userId) throw new Error("Forbidden");

    await supabase
      .from("documents")
      .update({ status: "processing", page_count: data.pages.length, error: null })
      .eq("id", data.documentId);

    try {
      const allChunks: { page: number; content: string }[] = [];
      for (const p of data.pages) {
        for (const c of chunkText(p.text, p.page)) allChunks.push(c);
      }
      if (allChunks.length === 0) throw new Error("No extractable text found in PDF");

      const { createEmbeddings } = await import("@/lib/ai-gateway.server");
      const batchSize = 64;
      let chunkIndex = 0;
      for (let i = 0; i < allChunks.length; i += batchSize) {
        const batch = allChunks.slice(i, i + batchSize);
        const embeddings = await createEmbeddings(apiKey, batch.map((c) => c.content));
        const rows = batch.map((c, j) => ({
          document_id: data.documentId,
          user_id: userId,
          chunk_index: chunkIndex++,
          page: c.page,
          content: c.content,
          embedding: `[${embeddings[j].join(",")}]`,
        }));
        const { error: insErr } = await supabase.from("document_chunks").insert(rows);
        if (insErr) throw insErr;
      }

      await supabase
        .from("documents")
        .update({ status: "ready" })
        .eq("id", data.documentId);

      return { ok: true, chunks: allChunks.length };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await supabase
        .from("documents")
        .update({ status: "failed", error: message })
        .eq("id", data.documentId);
      throw err;
    }
  });
