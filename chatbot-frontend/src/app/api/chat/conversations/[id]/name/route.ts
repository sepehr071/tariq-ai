import { NextRequest, NextResponse } from "next/server";
import { renameConversation } from "@/lib/dify";
import { readAccessToken } from "@/lib/keycloak";
import { verifyAccessToken } from "@/lib/auth-verify";

const MAX_NAME_LENGTH = 200;
const REQUEST_TIMEOUT_MS = 15_000;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = await readAccessToken();
    if (!token) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    const claims = await verifyAccessToken(token);
    if (!claims) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Missing conversation id" }, { status: 400 });
    }

    const body = (await request.json()) as { name?: unknown };
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name || name.length > MAX_NAME_LENGTH) {
      return NextResponse.json({ error: "Invalid name" }, { status: 400 });
    }

    const upstream = await renameConversation({
      conversationId: id,
      user: claims.sub,
      name,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!upstream.ok) {
      return NextResponse.json(
        { error: "Failed to rename conversation" },
        { status: upstream.status }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/chat/conversations/[id]/name] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
