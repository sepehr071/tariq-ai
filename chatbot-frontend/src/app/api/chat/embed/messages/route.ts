import { NextRequest, NextResponse } from "next/server";
import { sendChatMessageForApp } from "@/lib/dify";
import { resolveEmbedApp } from "@/lib/embed-apps";
import { verifyEmbedToken } from "@/lib/embed-auth";

const MAX_USER_LENGTH = 128;
const MAX_QUERY_LENGTH = 8192;
const DIFY_REQUEST_TIMEOUT_MS = 30_000;
const KC_USER_PREFIX = "kc_";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { app, user, query, conversation_id, token } = body as {
      app?: string;
      user?: string;
      query?: string;
      conversation_id?: string;
      token?: string;
    };

    if (
      typeof query !== "string" ||
      query.length === 0 ||
      query.length > MAX_QUERY_LENGTH
    ) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    if (typeof app !== "string" || app.length === 0) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const appConfig = resolveEmbedApp(app);
    if (!appConfig) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    // Resolve effective user identity. A valid host-site Keycloak token wins
    // over the body's anon id; an invalid/missing token falls back to anon
    // unless the app is in EMBED_REQUIRE_AUTH.
    let effectiveUser: string | null = null;
    if (typeof token === "string" && token.length > 0) {
      const claims = await verifyEmbedToken(token);
      if (claims) {
        effectiveUser = `${KC_USER_PREFIX}${claims.sub}`;
      }
    }

    if (!effectiveUser) {
      if (appConfig.requireAuth) {
        return NextResponse.json(
          { error: "Authentication required" },
          { status: 401 }
        );
      }
      if (
        typeof user !== "string" ||
        user.length === 0 ||
        user.length > MAX_USER_LENGTH ||
        !user.startsWith("anon_")
      ) {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
      }
      effectiveUser = user;
    }

    const difyResponse = await sendChatMessageForApp({
      query,
      user: effectiveUser,
      conversationId: conversation_id,
      apiKey: appConfig.difyApiKey,
      baseUrl: appConfig.difyBaseUrl,
      signal: AbortSignal.timeout(DIFY_REQUEST_TIMEOUT_MS),
    });

    if (!difyResponse.ok) {
      return NextResponse.json(
        { error: "Failed to send message" },
        { status: difyResponse.status }
      );
    }

    return new Response(difyResponse.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
