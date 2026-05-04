# Embed Widget — Implementation Spec

Shared spec for three parallel implementation agents. Read this fully before editing any file.

## Goal

Serve the existing Tariq chat as a **floating widget** that first-party host sites embed via a single `<script>` tag. The current full-page `/[locale]/chat` and all Keycloak auth stay untouched.

## High-level architecture

```
chat.novin-dev.com (Next.js 16)

1. /[locale]/chat                    ← UNCHANGED (auth'd full-page)
2. /embed/[locale]                   ← NEW anonymous panel (loaded in iframe)
3. /widget.js                        ← NEW static launcher script
4. /api/chat/*                       ← UNCHANGED
5. /api/chat/embed/*                 ← NEW anonymous, same-origin only

Host site:
  <script src="https://chat.novin-dev.com/widget.js"
          data-app="support" async defer></script>
```

## Decisions locked

- **First-party only** — single CORS allowlist, no tenant DB.
- **Anonymous** — no login. Per-visitor `anonId` stored in `localStorage` on `chat.novin-dev.com`.
- **Single ongoing conversation per (visitor, app)** — resumed from `localStorage`.
- **Per-app Dify routing** — `data-app="<id>"` maps to `DIFY_API_KEY_<ID>` env var server-side.
- **Locale** — auto-detected from host `<html lang>`, overridable via `data-locale`.
- **Same-origin chat traffic** — iframe and `/api/chat/embed/*` share the Next.js origin, so no CORS plumbing on the API routes. Only the iframe itself needs `frame-ancestors` CSP.

## File ownership (NO OVERLAP)

### Agent A — Backend / Dify
- CREATE `src/lib/embed-apps.ts`
- CREATE `src/app/api/chat/embed/messages/route.ts`
- MODIFY `src/lib/dify.ts` (add one new exported function — do NOT touch existing `sendChatMessage`)
- MODIFY `.env.example` (add new vars at the bottom under `# Embed widget`)

### Agent B — Frontend `/embed` + state
- CREATE `src/app/embed/layout.tsx`
- CREATE `src/app/embed/[locale]/layout.tsx`
- CREATE `src/app/embed/[locale]/page.tsx`
- CREATE `src/components/chat-embed/embed-chat.tsx`
- CREATE `src/components/chat-embed/embed-header.tsx`
- CREATE `src/context/embed-chat-context.tsx`
- CREATE `src/lib/embed-api.ts`
- MODIFY `src/messages/en.json` (add `embed` namespace at end)
- MODIFY `src/messages/fa.json` (add `embed` namespace at end)
- MODIFY `src/proxy.ts` (add `/embed` bypass + `frame-ancestors` CSP header)

### Agent C — Launcher + demo
- CREATE `public/widget.js`
- CREATE `public/embed-test.html`

No agent may touch files owned by another agent. If a needed change is out of scope, leave a `// TODO(embed):` comment and report it.

## HTTP contract — `/api/chat/embed/messages`

`POST /api/chat/embed/messages`

Body:
```json
{
  "app": "support",
  "user": "anon_abc123",
  "query": "hello",
  "conversation_id": "",
  "token": "<host-site Keycloak access token>"
}
```

`token` is optional. When present and valid (verified via `src/lib/embed-auth.ts`), the server overrides the Dify `user` field with `kc_<sub>` and ignores the body's `user`. When the app is in `EMBED_REQUIRE_AUTH` and no valid token is present, the route returns 401 instead of falling back to anon.

Response: **SSE stream** (`text/event-stream`), piped straight from Dify. Same event shape as `/api/chat/messages` (see `src/lib/api.ts` `streamChatMessage`). Reuse `src/lib/api.ts` parser on the client side — copy or share the `streamChatMessage` logic adapted to call this endpoint instead.

Errors:
- 400: missing/invalid `app`, `user`, or `query`
- 401: app in `EMBED_REQUIRE_AUTH` but no valid token presented (client throws `EmbedAuthRequiredError` and emits `tariq:widget:authRequired`)
- 500: Dify proxy error

## Env vars (`.env.example` addition)

```bash
# ---------------------------------------------------------------------------
# Embed widget (anonymous, script-tag deployment)
# ---------------------------------------------------------------------------

# Comma-separated list of valid app IDs. Each must have a DIFY_API_KEY_<ID>.
EMBED_APPS=support,sales

# Per-app Dify API key (uppercase snake). Fallback to DIFY_API_KEY if unset.
DIFY_API_KEY_SUPPORT=
DIFY_API_KEY_SALES=

# Optional per-app base URL override (falls back to DIFY_BASE_URL)
# DIFY_BASE_URL_SUPPORT=

# Comma-separated list of host origins allowed to embed the /embed iframe.
# Used for frame-ancestors CSP. Include scheme + host (+ port if non-default).
# Example: https://novin-dev.com,http://localhost:3001
EMBED_ALLOWED_HOSTS=http://localhost:3001
```

## `src/lib/embed-apps.ts` — Agent A contract

```ts
export interface EmbedAppConfig {
  id: string;
  difyApiKey: string;
  difyBaseUrl: string;
}

// Returns config or null if appId is not in EMBED_APPS or its key is unset.
export function resolveEmbedApp(appId: string): EmbedAppConfig | null;
```

Implementation: parse `EMBED_APPS`, validate `appId` is in the list, read `DIFY_API_KEY_<APPID.toUpperCase()>` (fall back to `DIFY_API_KEY`), read `DIFY_BASE_URL_<APPID.toUpperCase()>` (fall back to `DIFY_BASE_URL`). Return `null` if the effective key or base URL is missing.

## `src/lib/dify.ts` — Agent A addition

Add a new exported function alongside `sendChatMessage`:

```ts
export async function sendChatMessageForApp({
  query,
  user,
  conversationId,
  apiKey,
  baseUrl,
}: {
  query: string;
  user: string;
  conversationId?: string;
  apiKey: string;
  baseUrl: string;
}): Promise<Response>
```

Same body/headers as `sendChatMessage` but uses the passed apiKey/baseUrl instead of calling `getDifyConfig()`.

## `src/proxy.ts` — Agent B change

Add early return for `/embed/*` before the existing chat-auth check, and attach a `Content-Security-Policy: frame-ancestors` response header so browsers allow the iframe to be loaded on the declared hosts.

```ts
// At top of proxy()
const isEmbed = pathname.startsWith("/embed");
if (isEmbed) {
  const res = handleI18nRouting(request); // still want locale negotiation
  const hosts = (process.env.EMBED_ALLOWED_HOSTS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const frameAncestors = ["'self'", ...hosts].join(" ");
  res.headers.set("Content-Security-Policy", `frame-ancestors ${frameAncestors}`);
  return res;
}
```

**Note:** i18n routing must still apply so that `/embed` → `/embed/en`. Verify `routing.ts` (`localePrefix`) works with this nested path; if not, hard-code the locale handling (`/embed` → `/embed/en`, `/embed/fa` passthrough).

## `postMessage` protocol — Agent B iframe ⟷ Agent C launcher

All messages include a `type` string prefixed `tariq:`. Both sides must validate `event.origin` matches the expected peer origin before acting.

**Host → iframe** (launcher sends):
- `{ type: "tariq:host:open" }`
- `{ type: "tariq:host:close" }`
- `{ type: "tariq:host:sendMessage", text: string }`
- `{ type: "tariq:host:reset" }`
- `{ type: "tariq:host:setLocale", locale: "fa" | "en" }`
- `{ type: "tariq:host:token", token: string }` — host-site Keycloak JWT, pushed before each send and on iframe ready
- `{ type: "tariq:host:clearToken" }` — drop the stored token; subsequent sends fall back to anon

**Iframe → host** (embed page sends):
- `{ type: "tariq:widget:ready" }`
- `{ type: "tariq:widget:messageReceived" }` — on each assistant chunk arrival (launcher can show unread badge)
- `{ type: "tariq:widget:closeRequested" }` — when user clicks X inside panel
- `{ type: "tariq:widget:authRequired" }` — server returned 401; host should redirect through its own login flow

## `window.Tariq` API — Agent C

```ts
window.Tariq = {
  open(): void
  close(): void
  toggle(): void
  sendMessage(text: string): void  // opens panel if closed, then posts message
  reset(): void
  setLocale(locale: "fa" | "en"): void
  setToken(jwt: string): void                                // host-site Keycloak access token
  setTokenProvider(fn: () => string | Promise<string>): void // refresh-aware async provider
  clearToken(): void
  on(event: "ready" | "open" | "close" | "message" | "authRequired", handler: () => void): void
  off(event: string, handler: () => void): void
};
```

## Script `data-*` attributes — Agent C

| Attribute | Default | Description |
|-----------|---------|-------------|
| `data-app` | — (**required**) | Must match an entry in `EMBED_APPS` |
| `data-locale` | auto-detect from `<html lang>` | `fa` or `en` |
| `data-position` | `bottom-end` | `bottom-end` or `bottom-start` (RTL-aware) |
| `data-theme` | `auto` | `light`, `dark`, or `auto` |
| `data-src` | inferred from script `src` | Override embed origin |
| `data-greeting` | (none) | Optional welcome message to inject before first user turn |
| `data-token` | (none) | Boot-time host-site Keycloak JWT. Equivalent to a single `setToken()` call. Prefer `setTokenProvider` for refresh-aware setups. |

## Widget UX

- Launcher: 56px circular floating button, brand teal (OKLCH same as app), chat icon, drop shadow. Position: `bottom: 16px; inline-end: 16px` (RTL-aware).
- Panel: ~380×600px, rounded, shadow, slides up on open. On mobile (<640px), full-screen modal.
- Header: app name + "New chat" button + close (×). No sidebar, no settings.
- Body: reuse `MessageBubble`, `TypingIndicator`, existing markdown styling.
- Input: island-style textarea, Enter to send.

## Session model

`localStorage` keys on `chat.novin-dev.com` (iframe domain, first-party from iframe's perspective):
- `tariq_embed_anon_id` — UUID, one per browser, reused across all apps
- `tariq_embed_conv_<appId>` — last conversation_id for this app

On page load:
1. Read or generate `anon_id`
2. Read `conv_<appId>`
3. If present, fetch existing messages (skip for v1 — just start fresh but keep `conversation_id` for Dify continuity)
4. Stream user input to `/api/chat/embed/messages` with `{ app, user: anon_id, query, conversation_id }`
5. On first token, capture new conversation_id (if we started blank)
6. On `end` event, persist `conv_<appId>` in localStorage

## Out of scope for v1

- Anonymous conversation history fetch on reload (keep conversation_id only; don't rehydrate message history)
- Multi-conversation drawer
- Rate limiting per IP / anon_id
- Unread badge counter numbers (only boolean "has unread")
- File attachments, voice — not supported by app anyway

## Verification checklist

1. `pnpm build` passes with no TS errors
2. `pnpm lint` passes
3. `pnpm dev` serves, navigate to `http://localhost:3000/en/chat` — still works unchanged
4. Open `http://localhost:3000/embed-test.html` (served via a simple `python -m http.server` from `public/` or by hitting `/embed-test.html` directly on the dev server) — launcher button appears, click it, panel opens, send a message, see streaming response
5. Switch host `<html lang="fa">` → widget opens in Persian RTL
6. Verify localStorage has `tariq_embed_anon_id` and `tariq_embed_conv_<app>` after first turn
7. Close and reopen panel → conversation persists (same conversation_id sent to Dify)

## Reuse from existing code

- SSE parsing: copy the loop from `src/lib/api.ts` `streamChatMessage`. Same Dify event shapes — ping/message/message_end/error. `answer` is INCREMENTAL chunks, must accumulate.
- Message types: `Message` shape from `src/context/chat-context.tsx`. Embed context can define its own narrower version.
- Markdown rendering: reuse `MessageBubble` directly (`src/components/chat/message-bubble.tsx`).
- Typing indicator: reuse `src/components/chat/typing-indicator.tsx`.
- Island input: inspiration from `src/components/chat/message-input.tsx`, but embed input is simpler (single-conversation, no abort surface needed beyond ref).

## Don't

- Don't add Keycloak login UI inside the iframe — host page handles login. The widget only **verifies** tokens the host pushed in via `setToken` / `setTokenProvider`; it never starts an OIDC flow.
- Don't touch `/api/auth/*`, `src/context/auth-context.tsx`, or `src/lib/keycloak.ts`.
- Don't modify existing `/[locale]/chat`, `src/components/chat/*` (except to read them).
- Don't write any backend/FastAPI changes — the embed API lives entirely in Next.js.
- Don't add CORS middleware to `/api/chat/embed/*` — it's same-origin.
