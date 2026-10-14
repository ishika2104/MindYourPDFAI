import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GetOrCreateInput = z.object({
  documentId: z.string().uuid(),
});

const ListInput = z.object({
  sessionId: z.string().uuid(),
});

const PersistInput = z.object({
  sessionId: z.string().uuid(),
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(50_000),
});

const SuggestInput = z.object({
  documentId: z.string().uuid(),
  lastUser: z.string().max(4000).optional(),
  lastAssistant: z.string().max(8000).optional(),
});

export const getOrCreateSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => GetOrCreateInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: doc } = await supabase
      .from("documents")
      .select("user_id, title")
      .eq("id", data.documentId)
      .single();
    if (!doc || doc.user_id !== userId) throw new Error("Forbidden");

    const { data: existing } = await supabase
      .from("chat_sessions")
      .select("id")
      .eq("user_id", userId)
      .eq("document_id", data.documentId)
      .eq("mode", "single")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (existing) return { sessionId: existing.id };

    const { data: created, error } = await supabase
      .from("chat_sessions")
      .insert({
        user_id: userId,
        document_id: data.documentId,
        mode: "single",
        title: doc.title,
      })
      .select("id")
      .single();
    if (error || !created) throw error ?? new Error("Could not create session");
    return { sessionId: created.id };
  });

export const listSessionMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => ListInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: sess } = await supabase
      .from("chat_sessions")
      .select("user_id")
      .eq("id", data.sessionId)
      .single();
    if (!sess || sess.user_id !== userId) throw new Error("Forbidden");

    const { data: rows, error } = await supabase
      .from("chat_messages")
      .select("id, role, content, created_at")
      .eq("session_id", data.sessionId)
      .order("created_at", { ascending: true })
      .limit(200);
    if (error) throw error;
    return { messages: rows ?? [] };
  });

export const persistMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => PersistInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: sess } = await supabase
      .from("chat_sessions")
      .select("user_id")
      .eq("id", data.sessionId)
      .single();
    if (!sess || sess.user_id !== userId) throw new Error("Forbidden");
    const { error } = await supabase.from("chat_messages").insert({
      session_id: data.sessionId,
      user_id: userId,
      role: data.role,
      content: data.content,
    });
    if (error) throw error;
    await supabase
      .from("chat_sessions")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", data.sessionId);
    return { ok: true };
  });

export const clearSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => ListInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: sess } = await supabase
      .from("chat_sessions")
      .select("user_id")
      .eq("id", data.sessionId)
      .single();
    if (!sess || sess.user_id !== userId) throw new Error("Forbidden");
    const { error } = await supabase
      .from("chat_messages")
      .delete()
      .eq("session_id", data.sessionId);
    if (error) throw error;
    return { ok: true };
  });

export const suggestFollowups = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => SuggestInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) return { suggestions: [] as string[] };

    const { data: doc } = await supabase
      .from("documents")
      .select("user_id, title")
      .eq("id", data.documentId)
      .single();
    if (!doc || doc.user_id !== userId) throw new Error("Forbidden");

    const prompt = `You are helping a user explore a PDF titled "${doc.title}".
Given the recent conversation, propose 3 concise follow-up questions the user is most likely to ask next.
Rules:
- Each question ≤ 12 words.
- No numbering, no quotes, no preamble.
- Return exactly 3 lines, one question per line.

USER: ${data.lastUser ?? "(n/a)"}
ASSISTANT: ${(data.lastAssistant ?? "").slice(0, 2000)}`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "Return only 3 short follow-up questions, one per line." },
          { role: "user", content: prompt },
        ],
      }),
    });
    if (!res.ok) return { suggestions: [] as string[] };
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = json.choices?.[0]?.message?.content ?? "";
    const suggestions = text
      .split(/\r?\n/)
      .map((l) => l.replace(/^\s*[-*\d.)]+\s*/, "").replace(/^["']|["']$/g, "").trim())
      .filter((l) => l.length > 3 && l.length < 140)
      .slice(0, 3);
    return { suggestions };
  });
