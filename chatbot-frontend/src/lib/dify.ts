// Server-only Dify API client
// All HTTP calls to Dify go through this module so the API key stays server-side.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DifyConversation {
  id: string;
  name: string;
  inputs: Record<string, unknown>;
  status: string;
  created_at: number;
  updated_at: number;
}

export interface DifyConversationsResponse {
  data: DifyConversation[];
  has_more: boolean;
  limit: number;
}

export interface DifyMessage {
  id: string;
  conversation_id: string;
  query: string;
  answer: string;
  created_at: number;
  feedback: { rating: string } | null;
}

export interface DifyMessagesResponse {
  data: DifyMessage[];
  has_more: boolean;
}

// ---------------------------------------------------------------------------
// Config helper
// ---------------------------------------------------------------------------

function getDifyConfig() {
  const apiKey = process.env.DIFY_API_KEY;
  const baseUrl = process.env.DIFY_BASE_URL;

  if (!apiKey) {
    throw new Error("DIFY_API_KEY is not set in environment variables");
  }
  if (!baseUrl) {
    throw new Error("DIFY_BASE_URL is not set in environment variables");
  }

  return { apiKey, baseUrl };
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

/**
 * Send a chat message via Dify streaming API.
 * Returns the raw Response so the caller can pipe the SSE body directly.
 */
export async function sendChatMessage({
  query,
  user,
  conversationId,
  signal,
}: {
  query: string;
  user: string;
  conversationId?: string;
  signal?: AbortSignal;
}): Promise<Response> {
  const { apiKey, baseUrl } = getDifyConfig();

  const response = await fetch(`${baseUrl}/chat-messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      user,
      response_mode: "streaming",
      conversation_id: conversationId ?? "",
      inputs: {},
      auto_generate_name: true,
    }),
    signal,
  });

  return response;
}

/**
 * Send a chat message via Dify streaming API using caller-supplied
 * credentials (for the anonymous embed widget, which resolves a per-app
 * key via `resolveEmbedApp`). Mirrors `sendChatMessage` but does not
 * read from the global Dify env vars.
 */
export async function sendChatMessageForApp({
  query,
  user,
  conversationId,
  apiKey,
  baseUrl,
  signal,
}: {
  query: string;
  user: string;
  conversationId?: string;
  apiKey: string;
  baseUrl: string;
  signal?: AbortSignal;
}): Promise<Response> {
  const response = await fetch(`${baseUrl}/chat-messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      user,
      response_mode: "streaming",
      conversation_id: conversationId ?? "",
      inputs: {},
      auto_generate_name: true,
    }),
    signal,
  });

  return response;
}

/**
 * List conversations for a user, sorted by most recently updated.
 */
export async function getConversations({
  user,
  lastId,
  limit,
}: {
  user: string;
  lastId?: string;
  limit?: number;
}): Promise<DifyConversationsResponse> {
  const { apiKey, baseUrl } = getDifyConfig();

  const params = new URLSearchParams({
    user,
    sort_by: "-updated_at",
  });
  if (lastId) params.set("last_id", lastId);
  if (limit) params.set("limit", String(limit));

  const response = await fetch(`${baseUrl}/conversations?${params}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Dify conversations API returned ${response.status}`);
  }

  return response.json() as Promise<DifyConversationsResponse>;
}

/**
 * Fetch messages for a specific conversation.
 */
export async function getMessages({
  conversationId,
  user,
  firstId,
  limit,
}: {
  conversationId: string;
  user: string;
  firstId?: string;
  limit?: number;
}): Promise<DifyMessagesResponse> {
  const { apiKey, baseUrl } = getDifyConfig();

  const params = new URLSearchParams({
    conversation_id: conversationId,
    user,
  });
  if (firstId) params.set("first_id", firstId);
  if (limit) params.set("limit", String(limit));

  const response = await fetch(`${baseUrl}/messages?${params}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Dify messages API returned ${response.status}`);
  }

  return response.json() as Promise<DifyMessagesResponse>;
}

/**
 * Rename a conversation. Pass `auto_generate=false` so Dify uses the provided
 * `name` literally instead of re-running its summarizer (which would re-see the
 * preset wrapper baked into the stored query).
 */
export async function renameConversation({
  conversationId,
  user,
  name,
  signal,
}: {
  conversationId: string;
  user: string;
  name: string;
  signal?: AbortSignal;
}): Promise<Response> {
  const { apiKey, baseUrl } = getDifyConfig();
  return fetch(`${baseUrl}/conversations/${conversationId}/name`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name, user, auto_generate: false }),
    signal,
  });
}

/**
 * Delete a conversation by ID.
 */
export async function deleteConversation({
  conversationId,
  user,
}: {
  conversationId: string;
  user: string;
}): Promise<void> {
  const { apiKey, baseUrl } = getDifyConfig();

  const response = await fetch(`${baseUrl}/conversations/${conversationId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ user }),
  });

  if (!response.ok) {
    throw new Error(`Dify delete conversation API returned ${response.status}`);
  }
}
