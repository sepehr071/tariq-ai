# Tariq AI — Embeddable Chat Widget

A drop-in chat bubble that any website can install with **one `<script>` tag**. Anonymous, locale-aware, iframe-sandboxed, routed to a per-host Dify app.

> The widget is a **second surface on the same Next.js deployment** as the authenticated `/[locale]/chat` page. Both live in `chatbot-frontend/`. Embedding a chat bubble on a customer site needs **only** the frontend and a Dify API key — the FastAPI backend and Keycloak are not in the widget path.

---

## Architecture

```
                               ┌──────────────────────────────┐
  Host site (acme.com)         │  Next.js (chatbot-frontend)  │                     Dify
  ───────────────────          │  ──────────────────────────  │                     ────
                               │                              │
  <script src=".../widget.js"> │                              │
  data-app="support">          │                              │
        │                      │                              │
        │ 1. fetch launcher    │                              │
        ▼                      │                              │
  widget.js (vanilla)          │                              │
  - reads data-*               │                              │
  - floating button            │                              │
  - lazy iframe on open        │                              │
        │                      │                              │
        │ 2. <iframe src="/embed/en?app=support">             │
        ├─────────────────────►│ /embed/[locale]/page.tsx     │
        │                      │ (EmbedChatProvider)          │
        │                      │   • anon_<uuid> in LS        │
        │                      │   • conv id in LS            │
        │                      │                              │
        │ 3. postMessage       │                              │
        │   tariq:host:*       │                              │
        │◄────────────────────►│  origin-allowlisted          │
        │   tariq:widget:*     │                              │
        │                      │                              │
        │                      │ 4. POST /api/chat/embed/msg  │
        │                      │    { app, user, query, ... } │
        │                      │  src/lib/embed-apps.ts       │
        │                      │  resolves DIFY_API_KEY_<APP> │
        │                      │─────────────────────────────►│ /v1/chat-messages
        │                      │  SSE passthrough            ◄│  (streaming)
        │                      │                              │
```

Key properties:

- **Anonymous by default, optionally Keycloak-aware:** no FastAPI in the path. Widget traffic terminates at Next.js + Dify. If the host site exposes a Keycloak token via `window.Tariq.setTokenProvider(...)`, the embed route validates it against the configured embed realm and Dify gets `user: kc_<sub>` instead of `anon_<uuid>`. See **Host-site authentication** below.
- **Per-host app routing:** one deployment serves many customer bots via `EMBED_APPS=support,sales,docs` + `DIFY_API_KEY_SUPPORT=...`.
- **Iframe sandbox:** the widget panel is rendered on your own origin; host sites cannot read Dify traffic, cookies, or localStorage from the widget frame.
- **`frame-ancestors` CSP** enforced by `src/proxy.ts` — only hosts in `EMBED_ALLOWED_HOSTS` can embed the iframe; browsers block everyone else.

---

## Deployment

The widget is served by the **same** `pnpm build && pnpm start` as the main site. No separate build, no separate host. Environment variables are the entire surface.

### `.env` / `.env.local`

```env
# Shared with authenticated chat
DIFY_API_KEY=app-...default                    # Default Dify key; used as fallback when a per-app key is missing
DIFY_BASE_URL=https://dify.novin-dev.com/v1
NEXT_PUBLIC_APP_ORIGIN=https://chat.acme.com   # This Next.js deployment's public origin

# Widget-only
EMBED_APPS=support,sales,docs                  # Allowlist of app IDs accepted by /api/chat/embed/messages
DIFY_API_KEY_SUPPORT=app-abc...                # Resolved via DIFY_API_KEY_<APPID_UPPER>
DIFY_API_KEY_SALES=app-def...
DIFY_API_KEY_DOCS=app-ghi...

# Iframe allowlist (comma-separated ORIGINS — include scheme, no trailing slash)
EMBED_ALLOWED_HOSTS=https://acme.com,https://www.acme.com,https://docs.acme.com
```

Rules:

- **`EMBED_APPS` is mandatory** for the widget path. If unset, `/api/chat/embed/messages` returns `400 Invalid request` for every call.
- **Per-app key lookup:** `DIFY_API_KEY_<APPID>` where `<APPID>` is the app id uppercased (e.g. `support` → `DIFY_API_KEY_SUPPORT`). If missing, the route falls back to `DIFY_API_KEY`.
- **`EMBED_ALLOWED_HOSTS` uses origins, not hostnames.** `acme.com` will not match — use `https://acme.com`.
- **Widget-only deployments can omit** `FASTAPI_URL`, `KEYCLOAK_*`. The embed route never reads them.

---

## Host-site integration

### One-line install

Paste this into the host page, usually before `</body>`:

```html
<script
  src="https://chat.acme.com/widget.js"
  data-app="support"
  defer
></script>
```

That's it. A floating chat bubble appears; clicking it opens the panel.

### `data-*` attributes (on the `<script>` tag)

| Attribute | Required | Default | Values | Notes |
|-----------|----------|---------|--------|-------|
| `data-app` | **yes** | — | Any id in `EMBED_APPS` | Selects which Dify bot answers |
| `data-locale` | no | auto (`<html lang>`) | `en`, `fa` | Overrides host-page locale detection |
| `data-position` | no | `end-bottom` | `end-bottom`, `start-bottom` | RTL-aware; `end` = right in LTR, left in RTL |
| `data-theme` | no | `auto` | `auto`, `light`, `dark` | `auto` follows the host page's `prefers-color-scheme` |
| `data-src` | no | derived from script `src` origin | any absolute URL | Full override of the iframe URL (rare) |
| `data-greeting` | no | translation default | any string | Custom first-open greeting |

The script tag's own `src` origin is what `widget.js` uses to build the iframe URL, so you can self-host `widget.js` on a CDN but still point at the canonical Next.js deployment — or omit `data-src` entirely and host everything from the same origin.

---

## Multi-site example

Same `chatbot-frontend` deployment, three different host sites, three different Dify bots:

**`acme.com`** — support bot, English by default, left-side bubble:
```html
<script src="https://chat.acme.com/widget.js"
        data-app="support"
        data-locale="en"
        data-position="start-bottom"
        defer></script>
```

**`sales.acme.com`** — sales bot, dark theme, custom greeting:
```html
<script src="https://chat.acme.com/widget.js"
        data-app="sales"
        data-theme="dark"
        data-greeting="Looking for pricing? Ask me anything."
        defer></script>
```

**`docs.acme.ir`** — docs bot, Persian (auto-detected from `<html lang="fa">`):
```html
<script src="https://chat.acme.com/widget.js"
        data-app="docs"
        defer></script>
```

On the Next.js deployment this maps to:
```env
EMBED_APPS=support,sales,docs
DIFY_API_KEY_SUPPORT=app-abc...
DIFY_API_KEY_SALES=app-def...
DIFY_API_KEY_DOCS=app-ghi...
EMBED_ALLOWED_HOSTS=https://acme.com,https://sales.acme.com,https://docs.acme.ir
```

Each visitor has one ongoing conversation **per app per device** — the widget keeps a stable `anon_<uuid>` in `localStorage` and a conversation id keyed by `tariq_embed_conv_<appId>`.

---

## `window.Tariq` API

`widget.js` exposes an API on `window.Tariq` for host-page scripts:

| Method | Signature | Effect |
|--------|-----------|--------|
| `open()` | `(): void` | Opens the panel (mounts iframe on first call) |
| `close()` | `(): void` | Hides the panel |
| `toggle()` | `(): void` | Open ↔ closed |
| `sendMessage(text)` | `(text: string): void` | Opens the panel and asks a question as the user |
| `reset()` | `(): void` | Ends current conversation; next message starts a new one |
| `setLocale(locale)` | `("en" \| "fa"): void` | Re-loads the iframe with a new locale |
| `setToken(jwt)` | `(jwt: string): void` | Set a host-site Keycloak access token to authenticate widget requests |
| `setTokenProvider(fn)` | `(fn: () => string \| Promise<string>): void` | Async token provider invoked before each send (refresh-aware) |
| `clearToken()` | `(): void` | Drop the stored token + provider; widget falls back to anonymous |
| `on(event, fn)` | `(event: string, fn: (data?: any) => void): void` | Subscribe to widget events |
| `off(event, fn)` | `(event: string, fn: Function): void` | Unsubscribe |

Events (`on`/`off`):

- `ready` — iframe has loaded and announced itself
- `open`, `close` — panel visibility changes
- `messageReceived` — fired once per reply on the **first token** (useful for unread badges)
- `authRequired` — server rejected the request with 401 (token missing/invalid for an app in `EMBED_REQUIRE_AUTH`)

Example — pop the widget open from a "Need help?" CTA on the host page:

```js
document.querySelector("#need-help").addEventListener("click", () => {
  window.Tariq.sendMessage("I need help choosing a plan.");
});

window.Tariq.on("messageReceived", () => {
  if (document.hidden) showUnreadBadge();
});
```

---

## postMessage protocol

The iframe and the launcher communicate over `window.postMessage`. Both sides validate `event.origin` before acting.

**Launcher → iframe (`tariq:host:*`):**

| Type | Payload | Effect |
|------|---------|--------|
| `tariq:host:sendMessage` | `{ text: string }` | Send as the current user |
| `tariq:host:reset` | — | End current conversation |
| `tariq:host:token` | `{ token: string }` | Update the stored host-site Keycloak JWT used on subsequent sends |
| `tariq:host:clearToken` | — | Drop the stored token; subsequent sends are anonymous |

**Iframe → launcher (`tariq:widget:*`):**

| Type | Payload | Effect |
|------|---------|--------|
| `tariq:widget:ready` | — | Emitted once after mount — launcher resolves its ready promise |
| `tariq:widget:messageReceived` | — | First token of an assistant reply has arrived |
| `tariq:widget:authRequired` | — | Server returned 401 — host should redirect the user through Keycloak login |

In the iframe, origin validation uses `document.referrer` (the host page's origin) plus a dev fallback to `*` when `NODE_ENV !== "production"`. In production, messages from unknown origins are dropped silently.

---

## Host-site authentication (optional)

When the host site already has a logged-in Keycloak user, it can hand the user's access token to the widget so chat traffic is tied to a real identity (Dify receives `user: kc_<sub>` instead of `anon_<uuid>`). The host's Keycloak realm is a **separate** identity provider from Tariq's main realm — only the configured embed realm is trusted by the widget server.

### Host integration (the one-liner for host devs)

```html
<script src="https://chat.acme.com/widget.js" data-app="support" defer></script>
<script>
  // After your Keycloak instance is initialized:
  window.Tariq.setTokenProvider(async () => {
    await keycloak.updateToken(30); // refresh if <30s left
    return keycloak.token;
  });
  window.Tariq.on("authRequired", () => keycloak.login());
</script>
```

The provider is called once per send so the widget always uses a fresh token — host's existing refresh logic is reused. For hosts without a callback-friendly auth lib, `window.Tariq.setToken(jwt)` and `window.Tariq.clearToken()` are the imperative equivalents.

### Server config

Both vars are optional. When unset, the widget stays anonymous-only.

```env
# Issuer URL of the host site's Keycloak realm.
EMBED_KEYCLOAK_ISSUER=https://auth.acme.com/realms/acme

# Comma-separated acceptable `aud` values on the host's access token.
# Usually the host's Keycloak client id; or add an audience mapper that
# injects "tariq-widget".
EMBED_KEYCLOAK_AUDIENCE=tariq-widget,acme-web

# Per-app authentication requirement. Listed apps reject unauthed requests
# with 401. Apps NOT listed keep working anonymously (back-compat).
EMBED_REQUIRE_AUTH=support,sales
```

The widget server fetches and caches the host realm's JWKS, then validates each token's signature, `iss`, `aud`, and `exp` (`jose.jwtVerify`). Tokens never reach Dify — only the derived `kc_<sub>` user id does.

### Required-auth behaviour

| Scenario | Outcome |
|----------|---------|
| App in `EMBED_REQUIRE_AUTH`, no token sent | `401 Authentication required`; widget emits `authRequired` event |
| App in `EMBED_REQUIRE_AUTH`, invalid token | Same as above (treated as no token) |
| App in `EMBED_REQUIRE_AUTH`, valid token | Dify receives `user: kc_<sub>` |
| App NOT in `EMBED_REQUIRE_AUTH`, no token | Anonymous fallback — Dify receives `user: anon_<uuid>` |
| App NOT in `EMBED_REQUIRE_AUTH`, valid token | Dify receives `user: kc_<sub>` (auth opt-in) |

### Audience mapper note

Keycloak access tokens default to having only the issuing client in `aud`. If you don't want to add `tariq-widget,acme-web` to `EMBED_KEYCLOAK_AUDIENCE`, add an **Audience Resolve** or hard-coded **Audience** mapper on the host's Keycloak client to inject `tariq-widget` into the `aud` claim, then set `EMBED_KEYCLOAK_AUDIENCE=tariq-widget` only.

---

## Session persistence

| Thing | Stored in | Key | Lifetime |
|-------|-----------|-----|----------|
| Anonymous visitor id | `localStorage` of the iframe origin (= Next.js deployment) | `tariq_embed_anon_id` | Indefinite; regenerated if it doesn't start with `anon_` |
| Current conversation id per app | same | `tariq_embed_conv_<appId>` | Until `reset()` or user clears storage |
| Message history | Dify only (per conversation) | — | Until Dify retention policy kicks in |

**Important:** because `localStorage` is scoped to the iframe origin (the Next.js deployment), a visitor who opens the widget on `acme.com` and later on `sales.acme.com` — both pointing at `chat.acme.com/widget.js` — shares the same `anon_<uuid>` but has a **separate conversation per app**. They do NOT share conversation history across apps.

The widget does not read any host-page storage and does not write cookies on the host origin.

---

## Limitations & out-of-scope for v1

- **No file uploads, images, or voice.** Text-only, by platform charter.
- **No conversation history UI** inside the widget — single ongoing conversation, reset on demand. (Dify retains history server-side; there is just no picker.)
- **No Keycloak login UI inside the widget.** The widget does not start its own OIDC flow — host pages must run their own auth (typically `keycloak-js`) and hand a token in via `setTokenProvider`. See the **Host-site authentication** section above.
- **No shadow DOM on the host** — the launcher button is a normal DOM element in the host page. The iframe itself isolates the panel content.
- **No analytics forwarding.** Message counts, ratings, etc. live in Dify's own dashboard.
- **Browser support** matches modern evergreen browsers (Chrome, Firefox, Safari, Edge current + last two). No IE.

---

## Where to look

| Topic | Path |
|-------|------|
| Implementation spec (dev reference) | `chatbot-frontend/docs/embed-widget-spec.md` |
| Launcher source | `chatbot-frontend/public/widget.js` |
| Iframe route | `chatbot-frontend/src/app/embed/[locale]/page.tsx` |
| SSE proxy | `chatbot-frontend/src/app/api/chat/embed/messages/route.ts` |
| Per-app resolution | `chatbot-frontend/src/lib/embed-apps.ts` |
| Widget state + postMessage bridge | `chatbot-frontend/src/context/embed-chat-context.tsx` |
| Smoke-test host page | `chatbot-frontend/public/embed-test.html` (visit `/embed-test.html` on the dev server) |
