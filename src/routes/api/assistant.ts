import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

const BodySchema = z.object({
  messages: z
    .array(z.object({ role: z.string() }).passthrough())
    .min(1)
    .max(30),
});

export const Route = createFileRoute("/api/assistant")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let parsed: z.infer<typeof BodySchema>;
        try {
          parsed = BodySchema.parse(await request.json());
        } catch {
          return new Response("Bad request", { status: 400 });
        }
        const messages = parsed.messages as unknown as UIMessage[];
        if (JSON.stringify(messages).length > 80_000) {
          return new Response("Payload too large", { status: 413 });
        }

        const apiKey = process.env.LOVABLE_API_KEY;
        if (!apiKey) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        const system = `You are MyPDF Buddy 👀 — the cute in-app assistant for "mypdf :MindYourPDF AI".
You help users learn the product and use it confidently. Be warm, brief (1–4 short sentences), and a bit playful. Sprinkle a tasteful emoji when it fits.

What the product does:
- Upload PDFs (up to 25MB) on the Dashboard, then chat with them using AI.
- Answers cite page numbers from the document (RAG with semantic search).
- Generate summaries, ask follow-ups, and listen via browser Text-to-Speech on the document page.
- Ingestion shows live progress (Read → Upload → Save → Index) and can be cancelled.
- Activity log records started / completed / failed / cancelled events per document.
- Auth: Google OAuth or email + password.

If asked something unrelated, gently steer back to the app. Never invent features that aren't listed above.`;

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
