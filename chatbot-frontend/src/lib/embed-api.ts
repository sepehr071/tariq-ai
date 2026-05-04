// Client-side SSE streaming for the anonymous embed widget.
// Mirrors the parse loop in src/lib/api.ts::streamChatMessage but hits the
// embed-only endpoint and takes an explicit `app` identifier.

export type StreamEvent =
  | { type: "token"; content: string; conversationId: string }
  | { type: "end"; conversationId: string; messageId: string };

export interface StreamEmbedChatArgs {
  app: string;
  user: string;
  query: string;
  conversationId?: string;
  token?: string;
  signal?: AbortSignal;
}

export class EmbedAuthRequiredError extends Error {
  constructor(message = "Authentication required") {
    super(message);
    this.name = "EmbedAuthRequiredError";
  }
}

export async function* streamEmbedChatMessage({
  app,
  user,
  query,
  conversationId,
  token,
  signal,
}: StreamEmbedChatArgs): AsyncGenerator<StreamEvent> {
  const res = await fetch("/api/chat/embed/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      app,
      user,
      query,
      conversation_id: conversationId ?? "",
      ...(token ? { token } : {}),
    }),
    signal,
  });

  if (res.status === 401) {
    throw new EmbedAuthRequiredError();
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Embed chat request failed (${res.status}): ${text}`);
  }

  if (!res.body) {
    throw new Error("Response body is empty — no stream available");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const MAX_SSE_BUFFER_BYTES = 1_000_000;
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      // Defensive cap on buffer growth — protects against a malicious or
      // misbehaving upstream that streams a single line without newlines.
      // Well-formed streams reset the buffer at every event boundary below
      // (lines.pop() retains only the trailing incomplete fragment).
      if (buffer.length > MAX_SSE_BUFFER_BYTES) {
        throw new Error("SSE buffer overflow");
      }
      const lines = buffer.split("\n");
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
