import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";
import { NextRequest, NextResponse } from "next/server";

const handleI18nRouting = createMiddleware(routing);

function buildFrameAncestors(): string {
  const raw = process.env.EMBED_ALLOWED_HOSTS ?? "";
  const hosts = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // In dev, if the allowlist is empty, permit any embedder so localhost demo pages work.
  if (hosts.length === 0 && process.env.NODE_ENV !== "production") {
    return "* 'self'";
  }

  return ["'self'", ...hosts].join(" ");
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // /embed/* — anonymous embed panel. Locale is encoded as /embed/[locale]
  // outside the next-intl [locale] group, so skip i18n middleware entirely
  // (otherwise it would treat "embed" as a missing locale and redirect).
  // Still attach frame-ancestors CSP so the iframe can be loaded on hosts.
  if (pathname.startsWith("/embed")) {
    const res = NextResponse.next();
    res.headers.set(
      "Content-Security-Policy",
      `frame-ancestors ${buildFrameAncestors()}`
    );
    return res;
  }

  // Check for protected /[locale]/chat routes
  // Match patterns like /en/chat, /fa/chat, /en/chat/..., /fa/chat/...
  const chatRouteMatch = pathname.match(/^\/(en|fa)(\/chat(?:\/|$))/);
  if (chatRouteMatch) {
    const locale = chatRouteMatch[1];
    const accessToken = request.cookies.get("tariq-access-token")?.value;

    if (!accessToken) {
      const loginUrl = new URL(`/${locale}/login`, request.url);
      return NextResponse.redirect(loginUrl);
    }
  }

  // Non-embed routes (landing, login, register, chat) — must never be framed.
  // X-Frame-Options for legacy UAs, CSP frame-ancestors 'none' for modern UAs.
  const res = handleI18nRouting(request);
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("Content-Security-Policy", "frame-ancestors 'none'");
  return res;
}

export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
