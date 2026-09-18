# Conversation API v1 — mobile contract

Base path: `/api/v1/conversations`

## Threads

| Method | Path | Response body |
|--------|------|----------------|
| POST | `/conversations` | `{ "thread": ConversationThreadDTO }` |
| GET | `/conversations/:id` | `{ "thread": ConversationThreadDTO }` |
| GET | `/conversations/:id?include=media` | `{ "thread": ConversationThreadDTO, "media": ThreadMediaItemDTO[] }` |
| GET | `/conversations` | `{ "threads": ConversationThreadDTO[], "nextCursor": string \| null }` |
| GET | `/conversations/:id/media` | `{ "items": ThreadMediaItemDTO[] }` |

Query on list: `status=ACTIVE|ARCHIVED`, `q=` (search title/preview/summary), `cursor`, `limit`.

### ConversationThreadDTO

- `id`, `title`, `titleSource`, `status`, `source`, `visibility`
- `lastMessageAt` (ISO string or null)
- Optional: `preview`, `mediaCount`, `compactSummary`

Does **not** include `agentStateJson` (use assistant chat for agent state).

## Messages

| Method | Path | Response body |
|--------|------|----------------|
| GET | `/conversations/:id/messages` | `{ "items": MessageDTO[], "nextCursor": string \| null }` |
| POST | `/conversations/:id/messages` | `{ "message": MessageDTO }` |

## Assistant (mobile)

| Method | Path | Body |
|--------|------|------|
| POST | `/api/v1/assistant/chat` | **Required** `threadId`, `message` |
| POST | `/api/v1/assistant/confirm` | **Required** `threadId`, `confirmed`, optional `action` (ConversationAction id) |
| GET | `/api/v1/assistant/chat?threadId=` | Thread-scoped conversation payload |

Web `/api/assistant/chat` may omit `threadId` (default agent thread is created).

Fixtures: `tests/fixtures/conversation-api/`.
