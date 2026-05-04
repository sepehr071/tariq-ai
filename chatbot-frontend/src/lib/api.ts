import type { Conversation, Message } from "@/context/chat-context";
import { sanitizeConversationTitle, stripPresetMarker } from "@/lib/chat-preset";

// --- Conversations ---

export async function fetchConversations(
  userId: string,
  lastId?: string,
  limit: number = 20
): Promise<{ conversations: Conversation[]; hasMore: boolean }> {
  const params = new URLSearchParams({
    user: userId,
    limit: String(limit),
  });
  if (lastId) params.set("last_id", lastId);

  const res = await fetch(`/api/chat/conversations?${params}`);
  if (!res.ok) throw new Error(`Failed to fetch conversations: ${res.status}`);

  const json = await res.json();
  const conversations: Conversation[] = json.data.map(
    (item: { id: string; name: string; created_at: number }) => ({
      id: item.id,
      title: sanitizeConversationTitle(item.name),
      createdAt: new Date(item.created_at * 1000),
    })
  );

  return { conversations, hasMore: json.has_more ?? false };
}

// --- Rename ---

export async function renameConversation(conversationId: string, name: string): Promise<void> {
  const res = await fetch(`/api/chat/conversations/${conversationId}/name`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(`Failed to rename conversation: ${res.status}`);
}

// --- Messages ---

export async function fetchMessages(
  userId: string,
  conversationId: string,
  firstId?: string,
  limit: number = 20
): Promise<{ messages: Message[]; hasMore: boolean }> {
  const params = new URLSearchParams({
    user: userId,
    limit: String(limit),
  });
  if (firstId) params.set("first_id", firstId);

  const res = await fetch(`/api/chat/conversations/${conversationId}/messages?${params}`);
  if (!res.ok) throw new Error(`Failed to fetch messages: ${res.status}`);

  const json = await res.json();

  // Sort by created_at ascending (chronological) regardless of Dify's return order,
  // then expand each Dify message (query + answer) into two Message objects.
  const sorted = [...json.data].sort(
    (a: { created_at: number }, b: { created_at: number }) => a.created_at - b.created_at
  );
  const messages: Message[] = sorted.flatMap(
    (item: { id: string; query: string; answer: string; created_at: number }) => [
      {
        id: `${item.id}-q`,
        role: "user" as const,
        content: stripPresetMarker(item.query),
        timestamp: new Date(item.created_at * 1000),
      },
      {
        id: `${item.id}-a`,
        role: "assistant" as const,
        content: item.answer,
        timestamp: new Date(item.created_at * 1000),
      },
    ]
  );

  return { messages, hasMore: json.has_more ?? false };
}

// --- Streaming chat ---

export type StreamEvent =
  | { type: "token"; content: string; conversationId: string }
  | { type: "end"; conversationId: string; messageId: string };

export async function* streamChatMessage(
  userId: string,
  query: string,
  conversationId?: string,
  signal?: AbortSignal
): AsyncGenerator<StreamEvent> {
  const res = await fetch("/api/chat/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      user: userId,
      conversation_id: conversationId ?? "",
    }),
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Chat request failed (${res.status}): ${text}`);
  }

  if (!res.body) {
    throw new Error("Response body is empty — no stream available");
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const MAX_SSE_BUFFER = 1_000_000;
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      if (buffer.length > MAX_SSE_BUFFER) {
        throw new Error("SSE buffer overflow");
      }
      const lines = buffer.split("\n");
      // Keep the last (potentially incomplete) line in the buffer.
      // After this, `buffer` only ever holds at most one partial line, so
      // it can't grow unbounded across reads as long as the upstream emits
      // newlines at a reasonable cadence — the cap above catches abuse.
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data: ")) continue;

        const jsonStr = trimmed.slice(6);
        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(jsonStr);
        } catch {
          continue;
        }

        const event = parsed.event as string | undefined;

        if (event === "error") {
          const code = parsed.code as number | undefined;
          const msg = parsed.message as string | undefined;
          throw new Error(`Dify error (${code}): ${msg}`);
        }

        if (event === "message") {
          yield {
            type: "token",
            content: parsed.answer as string,
            conversationId: parsed.conversation_id as string,
          };
        }

        if (event === "message_end") {
          yield {
            type: "end",
            conversationId: parsed.conversation_id as string,
            messageId: parsed.message_id as string,
          };
        }
        // Ignore ping, tts_message, and other event types
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// --- Delete ---

export async function deleteConversation(userId: string, conversationId: string): Promise<void> {
  const res = await fetch(`/api/chat/conversations/${conversationId}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user: userId }),
  });
  if (!res.ok) throw new Error(`Failed to delete conversation: ${res.status}`);
}
