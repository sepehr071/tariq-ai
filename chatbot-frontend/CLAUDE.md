# Tariq AI — Frontend

Bilingual (Persian/English) Next.js frontend for the Tariq AI chat platform. Landing page, user authentication, and chat interface. Text-only (no file uploads/images/voice). Consumes two backends:
- **Auth**: Keycloak (OIDC code flow + PKCE) → tokens stored as httpOnly cookies → FastAPI validates JWTs
- **Chat**: self-hosted Dify (SSE streaming)

## Tech Stack

| Layer | Choice | Version |
|-------|--------|---------|
| Framework | Next.js (App Router, Turbopack) | 16.1.6 |
| React | React | 19.2.3 |
| Styling | Tailwind CSS v4 (CSS-first, `@theme inline`, OKLCH colors) | ^4 |
| Components | shadcn/ui (new-york style, CSS variables) | ^3.8.5 |
| Animation | Framer Motion | ^12 |
| i18n | next-intl (locale-based routing `[locale]`) | ^4.8.3 |
| Theme | next-themes (light/dark, `attribute="class"`) | ^0.4.6 |
| Font | Vazirmatn (Google Fonts — covers Persian/Arabic + Latin) | — |
| Icons | lucide-react | ^0.575.0 |
| Markdown | react-markdown + remark-gfm (GFM tables, bold, lists) | ^9 |
| State | React Context + useReducer (Dify as source of truth) | — |
| Auth | Keycloak OIDC (PKCE S256) via server-side route handlers | — |

## Commands

```bash
pnpm dev      # Start dev server (webpack) — http://localhost:3000
pnpm build    # Production build (Turbopack)
pnpm start    # Start production server
pnpm lint     # ESLint
```

> **Dev compiler:** `dev` uses `next dev --webpack`. Next.js 16.1.x Turbopack
> has a known Windows compile hang on routes with dynamic segments; webpack
> avoids it. Production build and deployment use Turbopack as normal.

## Route Structure

| URL | File | Auth | Purpose |
|-----|------|------|---------|
| `/[locale]/` | `src/app/[locale]/page.tsx` | Public | Landing page |
| `/[locale]/login` | `src/app/[locale]/login/page.tsx` | Public (redirects if logged in) | Login (single button → Keycloak) |
| `/[locale]/register` | `src/app/[locale]/register/page.tsx` | Public (redirects if logged in) | Register (single button → Keycloak) |
| `/[locale]/chat` | `src/app/[locale]/chat/page.tsx` | Protected | Chat interface |
| `/embed/[locale]` | `src/app/embed/[locale]/page.tsx` | **Anonymous** | Widget panel (loaded inside an iframe on host sites) |
| `/widget.js` | `public/widget.js` | Anonymous | Launcher script; hosts paste one `<script>` tag |
| `/embed-test.html` | `public/embed-test.html` | Anonymous | Local smoke-test host page |
| `/api/auth/login` | `src/app/api/auth/login/route.ts` | — | Start OIDC flow (PKCE + redirect to Keycloak) |
| `/api/auth/register` | `src/app/api/auth/register/route.ts` | — | Start OIDC registration flow |
| `/api/auth/callback` | `src/app/api/auth/callback/route.ts` | — | Exchange code for tokens, set cookies |
| `/api/auth/refresh` | `src/app/api/auth/refresh/route.ts` | — | Rotate tokens via Keycloak |
| `/api/auth/logout` | `src/app/api/auth/logout/route.ts` | — | Revoke session, clear cookies |
| `/api/auth/me` | `src/app/api/auth/me/route.ts` | — | Proxy to FastAPI with auto-refresh |
| `/api/chat/*` | `src/app/api/chat/*` | — | Proxy to Dify (authenticated chat) |
| `/api/chat/embed/messages` | `src/app/api/chat/embed/messages/route.ts` | **Anonymous** | Widget SSE proxy; resolves per-host Dify app |

## Project Structure

```
src/
├── app/
│   ├── globals.css                 # Tailwind v4 + theme variables (OKLCH) + glassmorphism + gradient keyframes
│   ├── layout.tsx                  # Root layout (html, body)
│   ├── [locale]/
│   │   ├── layout.tsx              # Locale layout (font, dir, providers: Theme + i18n + Auth + Tooltip)
│   │   ├── page.tsx                # Landing page (Navbar + Hero + Features + CTA + Footer)
│   │   ├── login/page.tsx          # Login page (AuthLayout + single "Sign in" button)
│   │   ├── register/page.tsx       # Register page (AuthLayout + single "Create account" button)
│   │   └── chat/page.tsx           # Protected chat page (auth guard + ChatProvider + ChatLayout)
│   ├── embed/                      # Widget surface (outside [locale] group — no next-intl routing)
│   │   ├── layout.tsx              # Minimal html/body shell; no Navbar/Footer/AuthProvider
│   │   └── [locale]/
│   │       ├── layout.tsx          # Locale-aware font + dir, wraps children in EmbedChatProvider
│   │       └── page.tsx            # Panel rendered inside the iframe (EmbedHeader + EmbedChat)
│   └── api/
│       ├── auth/
│       │   ├── login/route.ts      # PKCE + state cookies → redirect to Keycloak /auth
│       │   ├── register/route.ts   # PKCE + state cookies → redirect to Keycloak /registrations
│       │   ├── callback/route.ts   # Code exchange → set httpOnly token cookies → redirect to app
│       │   ├── refresh/route.ts    # Rotate access + refresh tokens via Keycloak
│       │   ├── logout/route.ts     # Revoke refresh token at Keycloak, clear cookies
│       │   └── me/route.ts         # Forward Bearer to FastAPI ${FASTAPI_URL}/auth/me (API prefix baked into FASTAPI_URL), auto-refresh on 401
│       └── chat/                   # Dify proxy routes
│           ├── messages/route.ts               # Authenticated send
│           ├── conversations/route.ts          # Authenticated list
│           ├── conversations/[id]/
│           └── embed/messages/route.ts         # Anonymous SSE proxy for widget — resolves per-app Dify key, validates anon_* user
├── components/
│   ├── ui/                         # shadcn/ui primitives (avatar, button, dialog, glass-card, gradient-bg, input, label, scroll-area, separator, sheet, switch, tooltip)
│   ├── motion/
│   │   ├── fade-in.tsx             # Framer Motion directional fade-in wrapper
│   │   └── stagger-children.tsx    # Framer Motion staggered child reveal
│   ├── landing/
│   │   ├── navbar.tsx              # Glassmorphism sticky navbar (logo, auth CTAs, theme toggle, mobile Sheet)
│   │   ├── hero-section.tsx        # Full-viewport hero with gradient bg + staggered headline
│   │   ├── chat-demo.tsx           # Animated chat mockup (auto-typing bilingual conversation, loops)
│   │   ├── features-section.tsx    # 4 glassmorphism feature cards with scroll-triggered stagger
│   │   ├── cta-section.tsx         # Bottom CTA with gradient card
│   │   └── footer.tsx              # Simple footer
│   ├── auth/
│   │   ├── auth-layout.tsx         # Gradient bg + centered glassmorphism card wrapper
│   │   ├── login-form.tsx          # Single "Sign in" button → signIn() redirect to Keycloak
│   │   └── register-form.tsx       # Single "Create account" button → signUp() redirect to Keycloak
│   ├── chat/
│   │   ├── chat-layout.tsx         # Desktop sidebar + mobile Sheet + main area
│   │   ├── sidebar.tsx             # Conversation list, new chat, profile button
│   │   ├── sidebar-item.tsx        # Single conversation entry (Framer Motion staggered slide-in)
│   │   ├── chat-area.tsx           # Message list + welcome state (FadeIn) + floating island input
│   │   ├── message-bubble.tsx      # User/AI message with Framer Motion entrance + markdown
│   │   ├── message-input.tsx       # Floating island textarea, Enter to send
│   │   └── typing-indicator.tsx    # Bouncing dots animation
│   ├── chat-embed/                 # Widget-only UI (reuses message-bubble + typing-indicator from chat/)
│   │   ├── embed-header.tsx        # Close + reset buttons; postMessage out to parent launcher
│   │   └── embed-chat.tsx          # Panel body: message list + input (compact version of chat-area)
│   ├── settings-dialog.tsx         # Settings dialog (appearance + security sections)
│   ├── theme-toggle.tsx            # Legacy — functionality now in settings dialog + navbar
│   └── language-switcher.tsx       # Legacy — functionality now in settings dialog
├── context/
│   ├── auth-context.tsx            # AuthProvider: signIn/signUp (redirect to Keycloak), logout, getMe on mount
│   ├── chat-context.tsx            # Authenticated chat state: conversations, messages, typing (accepts userId prop)
│   ├── chat-preset-context.tsx     # Full-page chat only: answer-mode preset (mode + extra prompt), localStorage-synced
│   └── embed-chat-context.tsx      # Anonymous widget state: anonId, single conversationId, streaming, postMessage bridge
├── i18n/
│   ├── routing.ts                  # defineRouting({ locales: ["en", "fa"], defaultLocale: "en" })
│   ├── request.ts                  # getRequestConfig — loads messages JSON by locale
│   └── navigation.ts               # createNavigation(routing) — locale-aware Link, useRouter, usePathname
├── lib/
│   ├── utils.ts                    # cn() helper (clsx + tailwind-merge)
│   ├── keycloak.ts                 # Server-only OIDC helpers: PKCE, cookie management, token exchange/refresh/revoke
│   ├── dify.ts                     # Server-only Dify API client — exposes sendChatMessage (authed) and sendChatMessageForApp (per-app for widget)
│   ├── embed-apps.ts               # Server-only: parse EMBED_APPS, resolve per-app DIFY_API_KEY_<UPPER> with fallback to DIFY_API_KEY; flags requireAuth from EMBED_REQUIRE_AUTH
│   ├── embed-auth.ts               # Server-only: jose-based JWT verifier for the optional host-site Keycloak handoff (EMBED_KEYCLOAK_ISSUER + EMBED_KEYCLOAK_AUDIENCE)
│   ├── api.ts                      # Client-side chat API (authenticated) — SSE parser, accepts userId; strips preset marker on history fetch
│   ├── chat-preset.ts              # Pure module: PresetMode type, PRESET_TEMPLATES, buildDifyQuery, stripPresetMarker, DEFAULT_PRESET
│   ├── embed-api.ts                # Client-side widget API — streamEmbedChatMessage async generator; throws EmbedAuthRequiredError on 401
│   └── auth.ts                     # Client-side auth API (getMe, refreshSession, logout)
├── messages/
│   ├── en.json                     # English translations (namespaces: app, sidebar, chat, settings, auth, landing, embed)
│   └── fa.json                     # Persian translations (same namespaces)
└── proxy.ts                        # next-intl proxy + auth route protection for /[locale]/chat + CSP frame-ancestors for /embed

public/
├── widget.js                       # Vanilla JS launcher — hosts paste ONE <script> tag; injects button + lazy iframe
└── embed-test.html                 # Local smoke-test host page (3 buttons, exercises window.Tariq API)
```

## Architecture Decisions

### Authentication (Keycloak OIDC)

- **Keycloak** is the sole identity provider — no local user DB, no password handling in the app
- **OIDC Authorization Code + PKCE (S256)**: login/register pages show a single button that redirects to Keycloak
- **Server-side route handlers** in `src/app/api/auth/` manage the full flow:
  - `/login` and `/register` generate PKCE verifier + state, store in short-lived httpOnly cookies, redirect to Keycloak
  - `/callback` validates state, exchanges code for tokens, sets `tariq-access-token` + `tariq-refresh-token` as httpOnly cookies
  - `/refresh` rotates tokens via Keycloak's `grant_type=refresh_token`
  - `/logout` revokes refresh token at Keycloak, clears all cookies
  - `/me` forwards Bearer to FastAPI, auto-refreshes on 401
- **Shared OIDC logic** in `src/lib/keycloak.ts` (server-only): PKCE generation, cookie helpers, token exchange/refresh/revoke
- **Token cookies**: `tariq-access-token` (5 min), `tariq-refresh-token` (30 min SSO idle) — httpOnly, secure in production, sameSite=lax
- **Locale-aware**: `/api/auth/login` detects locale from `Referer` header and passes `ui_locales` to Keycloak so the login page renders in Persian or English
- `AuthProvider` context exposes `signIn()` / `signUp()` (redirect-based), `logout()`, and checks auth on mount via `getMe()`
- Route protection: `proxy.ts` checks `tariq-access-token` cookie for `/[locale]/chat*`; client-side auth guard in chat page redirects to `/login`
- User ID from Keycloak JWT `sub` claim — passed as `userId` prop to `ChatProvider` and all Dify API calls

### Landing Page

- Interactive chat demo (`chat-demo.tsx`) — orchestrated typing animation with bilingual conversation, auto-loops
- Glassmorphism visual style: `backdrop-blur-xl`, `bg-white/10`, `border border-white/20`
- Animated gradient mesh background (`gradient-bg.tsx`) with OKLCH teal-to-purple palette
- Framer Motion: staggered headline word reveal, scroll-triggered feature cards (`whileInView`, `viewport={{ once: true }}`), fade-in entrance animations
- `animate-gradient` CSS class for background animation (keyframes in `globals.css`)

### i18n (next-intl v4 + Next.js 16)

- Proxy at `src/proxy.ts` — Next.js 16 deprecated `middleware.ts` in favor of `proxy.ts` with `export function proxy()`. Do NOT rename to middleware.ts.
- `getMessages({ locale })` must receive explicit locale in locale layout — `requestLocale` resolves as `undefined` in Next.js 16
- Language switching uses `@/i18n/navigation` (`createNavigation`) — never use `next/navigation` directly for locale-aware routing
- Translation namespaces: `app`, `sidebar`, `chat`, `settings`, `auth`, `landing`

### RTL Support

- All directional properties use Tailwind logical utilities: `ms-*`, `me-*`, `ps-*`, `pe-*`, `border-e`, `border-s`, `start-*`, `end-*`
- `dir` attribute set on locale layout wrapper div based on locale
- Sheet sidebar uses locale-aware `side` prop: `locale === "fa" ? "right" : "left"` (SheetContent doesn't accept logical values like "start")

### Theme

- Glassmorphism + warm editorial aesthetic — stone/sand neutrals + teal accent
- OKLCH color space throughout `globals.css`
- Light: warm off-white bg, stone sidebar, charcoal text, teal accent (`oklch(0.655 0.1 175)`)
- Dark: deep warm gray bg, lighter sidebar, cream text, same teal accent
- `@custom-variant dark (&:is(.dark *))` for Tailwind v4 dark mode

### Chat Input (Island Style)

- Input floats at bottom of chat area using `sticky bottom-0` with gradient fade (`bg-gradient-to-t from-background`)
- Pill-shaped island: `rounded-3xl`, `shadow-lg`, `bg-card/90`, `backdrop-blur-sm`
- Messages scroll area has `pb-24` to prevent last message from hiding behind the floating input
- `pointer-events-none` on gradient wrapper, `pointer-events-auto` on inner container

### Markdown Rendering

- AI messages render through `ReactMarkdown` with `remarkGfm` plugin (tables, bold, italic, lists, links)
- User messages stay as plain text (`<p className="whitespace-pre-wrap">`)
- Custom component overrides in `message-bubble.tsx` for styled tables, lists, links
- Minimal CSS in `globals.css` under `.markdown-content` class (first/last child margin cleanup)
- Tables use logical `text-start` for RTL compatibility

### Settings Dialog

- `settings-dialog.tsx` wraps a `Dialog` with `children` as trigger
- Three sections: **Appearance** (dark mode Switch + EN/FA language buttons), **Answer Mode** (3 preset buttons + extra-prompt textarea), **Security** (change password — can link to Keycloak account page)
- Sidebar footer has a profile button (Avatar + "User" label + gear icon) that opens the dialog
- Answer Mode section consumes `useChatPreset()` — must render inside `ChatPresetProvider`. Currently only used inside `src/components/chat/sidebar.tsx`, which sits under the `/[locale]/chat` tree where the provider is mounted. If reused elsewhere, wrap with `ChatPresetProvider` or make the preset section conditional.

### Chat Preset (Answer Mode)

Full-page chat only (`/[locale]/chat`) — widget untouched.

- User picks one of 3 modes (`long` / `medium` / `short`) + optional extra-prompt text in the Settings dialog. State lives in `ChatPresetProvider` (`src/context/chat-preset-context.tsx`), persisted to `localStorage` under `tariq-chat-preset` as `{mode, extra}` JSON. Default: `medium` + empty extra.
- Dify system prompt is fixed server-side; the preset is delivered to Dify as a prefix on every user turn via `buildDifyQuery(preset, content)` in `src/lib/chat-preset.ts`. Output format:
  ```
  [[PRESET:<mode>]]<template>\n<extra?>[[/PRESET]]\n<user text>
  ```
- UI invariant: `ChatContext.sendMessage` dispatches `ADD_USER_MESSAGE` with the **raw** user text, and only passes the wrapped `difyQuery` into `streamChatMessage`. The bubble never shows the preset.
- **History reload gotcha:** Dify stores whatever `query` was sent and replays it in `GET /v1/messages`. `apiFetchMessages` in `src/lib/api.ts` applies `stripPresetMarker(item.query)` before constructing the user `Message` — otherwise old messages would leak the preset text. If the marker format changes, the regex in `chat-preset.ts` must stay in sync.
- Mode change mid-conversation is silent — next `sendMessage` picks up the new value via `presetRef.current` (ref pattern keeps `sendMessage`'s useCallback deps stable).
- Provider mount: `ChatPresetProvider` wraps `ChatProvider` in `src/app/[locale]/chat/page.tsx` so both the Settings dialog and `sendMessage` read the same state.
- Preset templates are English strings in `PRESET_TEMPLATES` (not translated) — Dify is prompt-agnostic. If Dify ever needs locale-specific preset text, localize via the messages catalog and pass `locale` into `buildDifyQuery`.

### State

- `ChatProvider` accepts `userId: string` prop — no more anonymous UUIDs
- Conversations fetched from Dify API on mount, messages loaded on-demand when conversation selected
- `Conversation` type has no `messages[]` — messages live in flat `state.messages` for active conversation only
- localStorage keys (authenticated app): `tariq-active-conversation` (last active ID), `tariq-chat-preset` (answer-mode preset JSON)
- `sendMessage` uses SSE streaming via async generator — tokens accumulate with `UPDATE_LAST_MESSAGE`
- Assistant message added on first token (not before streaming) to avoid double-bubble
- `initializedRef` pattern prevents persist effect from clearing localStorage before init reads it (React Strict Mode safe)

### Embed Widget (Anonymous)

- **Second surface on the same Next.js deployment** — the authenticated `/[locale]/chat` flow is untouched. Widget lives at `/embed/[locale]`, loaded inside an iframe injected by `public/widget.js`.
- **No login, no Keycloak, no FastAPI** — widget traffic never touches the auth backend. Only Dify is required to serve widget-only deployments.
- **Per-host Dify app routing** via `EMBED_APPS=support,sales,docs` + `DIFY_API_KEY_SUPPORT=...` etc. `src/lib/embed-apps.ts` resolves `app` → API key (falls back to shared `DIFY_API_KEY` if `DIFY_API_KEY_<UPPER>` is unset). Unknown app → 400 with generic "Invalid request".
- **Anonymous session model** — `src/context/embed-chat-context.tsx` generates a stable `anon_<uuid>` on first load, stores it in `localStorage` (`tariq_embed_anon_id`). Backend route REQUIRES the `anon_` prefix and `length ≤ 128` — plain UUIDs from older builds are regenerated.
- **Single ongoing conversation per app per visitor** — `conversationId` stored under `tariq_embed_conv_<appId>`. Cleared on explicit reset. No sidebar, no conversation list, no history page.
- **Embed route is outside the `[locale]` group** so next-intl doesn't redirect `/embed/en` → `/fa/embed/en`. `proxy.ts` detects `/embed` prefix, skips `handleI18nRouting`, and instead sets `Content-Security-Policy: frame-ancestors` from `EMBED_ALLOWED_HOSTS` so only allowlisted host sites can frame the widget.
- **postMessage protocol** (iframe ⟷ parent launcher, origin-checked):
  - out: `tariq:widget:ready` (once on mount), `tariq:widget:messageReceived` (on first token of each reply), `tariq:widget:authRequired` (server returned 401)
  - in: `tariq:host:sendMessage` ({ text }), `tariq:host:reset`, `tariq:host:token` ({ token }), `tariq:host:clearToken`
- **Launcher (`public/widget.js`)** is plain vanilla JS with zero dependencies — reads `data-*` attrs from the `<script>` tag (`data-app`, `data-locale`, `data-position`, `data-theme`, `data-greeting`, `data-token`), creates a floating button + lazy-mounts the iframe on first open, exposes `window.Tariq` with `open() / close() / toggle() / sendMessage() / reset() / setLocale() / setToken() / setTokenProvider() / clearToken() / on() / off()`. Events: `ready`, `open`, `close`, `messageReceived`, `authRequired`.
- **Locale** auto-detects from the host page's `<html lang>` attribute at launcher load time; overridable with `data-locale` or `window.Tariq.setLocale()`.
- **Optional host-site Keycloak handoff** — when the host has an authenticated Keycloak user, it can call `window.Tariq.setTokenProvider(async () => keycloak.token)`. The launcher pushes the resolved JWT via `tariq:host:token` postMessage; `embed-chat-context.tsx` stores it in a `useRef` (in-memory only, never persisted to localStorage) and `streamEmbedChatMessage` includes it in the request body. `/api/chat/embed/messages` validates it via `src/lib/embed-auth.ts` (`jose.jwtVerify` against `EMBED_KEYCLOAK_ISSUER`'s JWKS, `EMBED_KEYCLOAK_AUDIENCE` accepted aud list) and overrides the Dify `user` field with `kc_<sub>`. Per-app required-auth is opt-in via `EMBED_REQUIRE_AUTH=support,sales` — apps in this list 401 unauthed requests; apps not in the list keep their anonymous fallback. The host realm is **separate** from Tariq's main `KEYCLOAK_ISSUER`. Tokens never reach Dify.
- **Out of scope for v1**: file uploads, images, voice, conversation history UI, Keycloak login UI from inside the widget (host page handles login flow), shadow DOM on the host.

### Dify Backend Integration

- Self-hosted at `https://dify.novin-dev.com/`, API base: `/v1`
- API key in `.env.local` (`DIFY_API_KEY`) — NEVER expose client-side. All requests proxied through `/api/chat/*` routes
- `src/lib/dify.ts` is server-only; `src/lib/api.ts` is the client-facing service
- SSE streaming: `answer` field in `message` events contains **incremental chunks** (not cumulative) — must use `accumulated +=`
- GET `/v1/messages` returns messages in DESC order — always sort by `created_at` ascending, never rely on `.reverse()`
- `conversation_id: ""` (empty string) to start a new conversation; Dify returns the new ID in the first SSE event
- `auto_generate_name: true` lets Dify auto-title conversations
- `user` param required on all endpoints — uses authenticated user's UUID from Keycloak JWT
- Full-page chat wraps the user turn with a preset marker before sending: `query = "[[PRESET:<mode>]]<template>\n<extra>[[/PRESET]]\n<user text>"`. Dify persists the full string, so `fetchMessages` strips the marker on replay. See `src/lib/chat-preset.ts`. Widget path does **not** wrap — embed flow is preset-free.

## Environment Variables

`.env.local`:
```
# --- Authenticated full-page chat ---
DIFY_API_KEY=...                                    # Default Dify API key (server-only) — used by authed /chat and as fallback for widget apps
DIFY_BASE_URL=https://dify.novin-dev.com/v1
FASTAPI_URL=http://localhost:8000/api/v1            # Auth backend URL incl. backend's API_PREFIX
KEYCLOAK_ISSUER=http://localhost:8080/realms/tariq  # Keycloak realm issuer
KEYCLOAK_CLIENT_ID=tariq-web                        # Keycloak public client
NEXT_PUBLIC_APP_ORIGIN=http://localhost:3000        # This app's origin (for redirect URIs)

# --- Embed widget (anonymous) ---
EMBED_APPS=support,sales,docs                       # Comma-separated allowlist of app IDs the widget accepts
DIFY_API_KEY_SUPPORT=app-...                        # Per-app Dify key (UPPERCASE app ID suffix); falls back to DIFY_API_KEY if unset
DIFY_API_KEY_SALES=app-...
DIFY_API_KEY_DOCS=app-...
EMBED_ALLOWED_HOSTS=https://acme.com,https://docs.acme.com   # frame-ancestors CSP — which sites may iframe /embed/*

# --- Embed widget — host-site Keycloak handoff (optional) ---
EMBED_KEYCLOAK_ISSUER=https://auth.acme.com/realms/acme      # Host site's Keycloak realm issuer (separate from main KEYCLOAK_ISSUER)
EMBED_KEYCLOAK_AUDIENCE=tariq-widget,acme-web                # Comma-separated accepted aud values on the host's access token
EMBED_REQUIRE_AUTH=support,sales                             # Apps that reject unauthed widget requests with 401 (others stay anon-friendly)
```

- Widget-only deployments can omit `FASTAPI_URL` and the `KEYCLOAK_*` vars entirely — the embed route never touches them.
- Missing `EMBED_APPS` causes `/api/chat/embed/messages` to return 400 for every request. It is not optional for the widget path.
- `EMBED_KEYCLOAK_ISSUER` + `EMBED_KEYCLOAK_AUDIENCE` are optional. When unset, host-site auth handoff is disabled and `EMBED_REQUIRE_AUTH` apps will always 401 (because no token can ever validate). Set both, or neither.

## Conventions

- Path alias: `@/*` → `./src/*`
- `"use client"` on all interactive components
- shadcn/ui components in `src/components/ui/` — do not manually edit, use `pnpm dlx shadcn@latest add <component>`
- Translations: add keys to both `en.json` and `fa.json` simultaneously
- No `next/navigation` for locale-aware routing — always use `@/i18n/navigation`
- Markdown in AI messages: add custom component overrides in `message-bubble.tsx`, use logical CSS properties (`ms-*`, `text-start`) for RTL
- API routes at `src/app/api/` — outside `[locale]`, excluded by proxy matcher
- Environment: `.env.local` for secrets (gitignored)
- In Next.js 16 route handlers, `params` is a `Promise` — must `await params` before accessing
- Framer Motion for all animations — use `whileInView` with `viewport={{ once: true }}` for scroll-triggered reveals
- All API functions in `src/lib/api.ts` accept `userId` as first param — no anonymous UUID generation
- Auth cookies: `tariq-access-token` (5 min), `tariq-refresh-token` (30 min) — httpOnly, secure in production
- OIDC logic lives in `src/lib/keycloak.ts` (server-only) — never import in client components
