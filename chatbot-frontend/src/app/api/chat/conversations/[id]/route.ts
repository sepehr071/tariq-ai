import { NextRequest, NextResponse } from "next/server";
import { deleteConversation } from "@/lib/dify";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const body = await request.json();
    const { user } = body as { user?: string };

    if (!user) {
      return NextResponse.json({ error: "Missing required field: user" }, { status: 400 });
    }

    await deleteConversation({ conversationId: id, user });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
