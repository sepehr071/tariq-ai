import { NextRequest, NextResponse } from "next/server";
import { getMessages } from "@/lib/dify";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const { searchParams } = request.nextUrl;
    const user = searchParams.get("user");
    const firstId = searchParams.get("first_id") ?? undefined;
    const limitParam = searchParams.get("limit");
    const limit = limitParam ? Number(limitParam) : undefined;

    if (!user) {
      return NextResponse.json({ error: "Missing required parameter: user" }, { status: 400 });
    }

    const result = await getMessages({
      conversationId: id,
      user,
      firstId,
      limit,
    });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
