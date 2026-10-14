<<<<<<< HEAD
# mypdf : MindYourPDF AI

Production-grade AI document intelligence: upload PDFs, chat with them, generate summaries and insights, study with AI-generated flashcards, search across your whole library, and compare multiple documents side by side.

## Stack

- **Frontend**: TanStack Start (React 19, Vite 7), Tailwind v4, shadcn/ui
- **Backend**: Lovable Cloud (Supabase — Postgres + pgvector + Auth + Storage) via TanStack `createServerFn`
- **AI**: Lovable AI Gateway (Gemini 3 Flash for chat/insights/study, embedding models for RAG)
- **PDF**: `pdfjs-dist` client-side extraction, chunked + embedded, retrieved with pgvector cosine similarity

## Features

### Core
- Email + Google auth (managed via Lovable broker)
- PDF upload with per-stage progress (read → upload → save → index)
- Streaming RAG chat with page-level citations
- 6 one-click summary styles (executive, technical, ELI5, bullets, action items, TL;DR)
- AI Insights: entities, dates, people, orgs, tech, risks, action items, FAQs
- Study mode: flashcards, MCQ (auto-graded), true/false, short answer
- TTS playback on summaries

### Workspace
- Universal semantic search across all PDFs (`/dashboard/search`)
- Multi-PDF compare and cross-document chat (`/dashboard/compare`)
- Analytics dashboard with library stats and search history (`/dashboard/analytics`)
- Cmd+K command palette for quick navigation
- Export chat / summaries / insights as Markdown, plain text, or JSON

### Hardening
- Row-level security on every table, scoped to `auth.uid()`
- Bearer-token authenticated server functions via `requireSupabaseAuth`
- Payload caps (200KB per chat request, 25MB per PDF)
- Naive per-user rate limit on the chat endpoint (30 req/min)
- Prompt-injection scrubbing on retrieval queries
- Cancellable uploads with server-side cleanup

## Local Development

```bash
bun install
bun dev
```

Environment variables (auto-injected by Lovable Cloud):

- `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` — browser client
- `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — server
- `LOVABLE_API_KEY` — AI Gateway

## Architecture

```
src/
├── routes/                    file-based routing
│   ├── index.tsx              landing page
│   ├── auth.tsx               sign in / sign up
│   ├── dashboard.tsx          shell + sidebar + cmd-k
│   ├── dashboard.index.tsx    upload + recent
│   ├── dashboard.$documentId.tsx   chat + tabs
│   ├── dashboard.search.tsx   universal semantic search
│   ├── dashboard.compare.tsx  multi-PDF chat
│   ├── dashboard.analytics.tsx
│   └── api/chat.ts            streaming RAG endpoint
├── lib/
│   ├── documents.functions.ts    upload / chunk / embed / finalize
│   ├── intelligence.functions.ts insights + summaries
│   ├── search.functions.ts       cross-doc search + favorites
│   ├── study.functions.ts        flashcard/MCQ generator
│   ├── ai-gateway.server.ts      Lovable AI provider
│   └── pdf-extract.browser.ts    pdfjs page extractor
└── components/dashboard/         SummariesPanel, InsightsPanel, StudyPanel, ExportMenu, CommandPalette, IngestionLog
```

### RAG pipeline

1. Client extracts pages with pdfjs (progress reported per page).
2. File uploaded to `pdfs` storage bucket.
3. `documents` row inserted (`status: pending`).
4. Text chunked and embedded in batches of 32 (server-side via AI Gateway).
5. Chunks written to `document_chunks` with pgvector embeddings.
6. Chat sends latest user message → embed → `match_document_chunks` (single doc) or `match_all_chunks` (multi-doc) → top-k stitched into system prompt → stream via AI SDK.

## Deployment

Publish from the Lovable editor. Backend, storage, and auth are managed automatically. External webhooks/APIs live under `src/routes/api/public/*` if ever needed.
=======
# MindYourPDFAI
MindYourPDF AI: Document Intelligence Agent
>>>>>>> cac920765aa9f8c74fb6aa6d2983b8d54c6ff315
