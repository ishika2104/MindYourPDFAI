# API Reference

All endpoints require a signed-in Supabase user unless noted. Server functions are called with `useServerFn` from the client and validate input with Zod.

## Server functions (`createServerFn` RPC)

### Documents — `src/lib/documents.functions.ts`
| Function              | Input                                         | Returns                       |
| --------------------- | --------------------------------------------- | ----------------------------- |
| `startIngestion`      | `{ documentId, totalPages }`                  | `{ ok }`                      |
| `embedChunkBatch`     | `{ documentId, startIndex, chunks[] }`        | `{ inserted }`                |
| `finalizeIngestion`   | `{ documentId, totalChunks }`                 | `{ ok }`                      |
| `failIngestion`       | `{ documentId, message }`                     | `{ ok }`                      |
| `cancelIngestion`     | `{ documentId?, filePath? }`                  | `{ ok }`                      |

### Intelligence — `src/lib/intelligence.functions.ts`
| Function             | Input                                        | Returns                       |
| -------------------- | -------------------------------------------- | ----------------------------- |
| `generateSummary`    | `{ documentId, kind, force? }`               | `{ summary }` — cached in `documents.summary_cache` |
| `generateInsights`   | `{ documentId }`                             | `{ insights }` — cached in `documents.insights`     |

`kind ∈ 'quick' | 'detailed' | 'executive' | 'bullet' | 'academic' | 'business'`.

### Chat — `src/lib/chat.functions.ts`
| Function                | Input                                          | Returns                     |
| ----------------------- | ---------------------------------------------- | --------------------------- |
| `getOrCreateSession`    | `{ documentId }`                               | `{ sessionId }`             |
| `listSessionMessages`   | `{ sessionId }`                                | `{ messages[] }`            |
| `persistMessage`        | `{ sessionId, role, content }`                 | `{ id }`                    |
| `clearSession`          | `{ sessionId }`                                | `{ ok }`                    |
| `suggestFollowups`      | `{ documentId, lastUser?, lastAssistant }`     | `{ suggestions[] }`         |

### Search — `src/lib/search.functions.ts`
| Function            | Input                                             | Returns              |
| ------------------- | ------------------------------------------------- | -------------------- |
| `universalSearch`   | `{ query, documentIds?, limit? }`                 | `{ results[] }`      |

### Study — `src/lib/study.functions.ts`
| Function            | Input                                             | Returns              |
| ------------------- | ------------------------------------------------- | -------------------- |
| `generateStudy`     | `{ documentId, kind, difficulty, count }`         | `{ items[] }`        |

`kind ∈ 'flashcards' | 'mcq' | 'truefalse' | 'fillblank' | 'short' | 'long'`.

## HTTP routes (streaming)

### `POST /api/chat`
Streams an AI SDK UI message stream (SSE).

Body:
```json
{
  "messages": UIMessage[],
  "documentId": "uuid",
  "documentIds": ["uuid", "..."],   // optional, cross-doc compare
  "researchMode": false              // optional, structured research output
}
```
Headers: `Authorization: Bearer <supabase-access-token>`.

Rate limited per-user (token bucket).

### `POST /api/assistant`
MyPDF Buddy — general assistant conversation, not tied to a document.

## Auth

- Sign-in providers: Email/password and Google (via Lovable OAuth broker).
- The client attaches the Supabase bearer token to every `createServerFn` call via `functionMiddleware` in `src/start.ts`.
- Server functions gated with `requireSupabaseAuth` — RLS applies as the signed-in user.

## Errors

- `4xx` — validation, auth, or provider errors (message included). Do not retry unchanged.
- `402` — Lovable AI credits exhausted.
- `429` — rate limited; back off.
- `5xx` — transient; retry with backoff.
