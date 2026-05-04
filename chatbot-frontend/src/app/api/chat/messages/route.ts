import { NextRequest, NextResponse } from "next/server";
import { sendChatMessage } from "@/lib/dify";
import { readAccessToken } from "@/lib/keycloak";
import { verifyAccessToken } from "@/lib/auth-verify";

const MAX_QUERY_LENGTH = 8192;
const REQUEST_TIMEOUT_MS = 30_000;

export async function POST(request: NextRequest) {
  try {
    const token = await readAccessToken();
    if (!token) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }

    const claims = await verifyAccessToken(token);
    if (!claims) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }

    const body = (await request.json()) as {
      query?: unknown;
      conversation_id?: unknown;
    };

    const { query, conversation_id } = body;

    if (typeof query !== "string" || query.length === 0) {
      return NextResponse.json(
        { error: "Missing required field: query" },
        { status: 400 }
      );
    }
    if (query.length > MAX_QUERY_LENGTH) {
      return NextResponse.json({ error: "query too large" }, { status: 413 });
    }

    const conversationId =
      typeof conversation_id === "string" && conversation_id.length > 0
        ? conversation_id
        : undefined;

    const difyResponse = await sendChatMessage({
      query,
      user: claims.sub,
      conversationId,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!difyResponse.ok) {
      return NextResponse.json(
        { error: "Failed to send message" },
        { status: difyResponse.status }
      );
    }

    // Pipe the SSE stream from Dify directly to the client
    return new Response(difyResponse.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    console.error("[/api/chat/messages] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
