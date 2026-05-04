import { NextRequest, NextResponse } from "next/server";
import { getConversations } from "@/lib/dify";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const user = searchParams.get("user");
    const lastId = searchParams.get("last_id") ?? undefined;
    const limitParam = searchParams.get("limit");
    const limit = limitParam ? Number(limitParam) : undefined;

    if (!user) {
      return NextResponse.json({ error: "Missing required parameter: user" }, { status: 400 });
    }

    const result = await getConversations({ user, lastId, limit });
    return NextResponse.json(result);
  } catch (err) {
    console.error("[/api/chat/conversations] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
