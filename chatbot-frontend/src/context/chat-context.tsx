"use client";

import {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import {
  fetchConversations as apiFetchConversations,
  fetchMessages as apiFetchMessages,
  streamChatMessage,
  deleteConversation as apiDeleteConversation,
  renameConversation as apiRenameConversation,
} from "@/lib/api";
import { useChatPreset } from "@/context/chat-preset-context";
import { buildDifyQuery } from "@/lib/chat-preset";

// --- Types ---

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: Date;
}

interface ChatState {
  conversations: Conversation[];
  activeId: string | null;
  messages: Message[];
  isTyping: boolean;
  isLoading: boolean;
  error: string | null;
}

type ChatAction =
  | { type: "SET_CONVERSATIONS"; conversations: Conversation[]; hasMore: boolean }
  | { type: "ADD_CONVERSATION"; conversation: Conversation }
  | { type: "REMOVE_CONVERSATION"; id: string }
  | { type: "SET_ACTIVE"; id: string | null }
  | { type: "SET_MESSAGES"; messages: Message[]; hasMore: boolean }
  | { type: "CLEAR_MESSAGES" }
  | { type: "ADD_USER_MESSAGE"; message: Message }
  | { type: "ADD_ASSISTANT_MESSAGE"; message: Message }
  | { type: "UPDATE_LAST_MESSAGE"; content: string }
  | { type: "SET_TYPING"; isTyping: boolean }
  | { type: "SET_LOADING"; isLoading: boolean }
  | { type: "SET_ERROR"; error: string | null };

interface ChatContextValue {
  conversations: Conversation[];
  activeConversation: Conversation | null;
  messages: Message[];
  isTyping: boolean;
  isLoading: boolean;
  error: string | null;
  loadConversations: () => Promise<void>;
  setActive: (id: string) => Promise<void>;
  sendMessage: (content: string) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  newChat: () => void;
  clearError: () => void;
}

// --- Reducer ---

const initialState: ChatState = {
  conversations: [],
  activeId: null,
  messages: [],
  isTyping: false,
  isLoading: false,
  error: null,
};

function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "SET_CONVERSATIONS":
      return { ...state, conversations: action.conversations };

    case "ADD_CONVERSATION":
      return {
        ...state,
        conversations: [action.conversation, ...state.conversations],
      };

    case "REMOVE_CONVERSATION": {
      const filtered = state.conversations.filter((c) => c.id !== action.id);
      const isActive = state.activeId === action.id;
      return {
        ...state,
        conversations: filtered,
        activeId: isActive ? null : state.activeId,
        messages: isActive ? [] : state.messages,
      };
    }

    case "SET_ACTIVE":
      return { ...state, activeId: action.id };

    case "SET_MESSAGES":
      return { ...state, messages: action.messages };

    case "CLEAR_MESSAGES":
      return { ...state, messages: [] };

    case "ADD_USER_MESSAGE":
      return { ...state, messages: [...state.messages, action.message] };

    case "ADD_ASSISTANT_MESSAGE":
      return { ...state, messages: [...state.messages, action.message] };

    case "UPDATE_LAST_MESSAGE": {
      const msgs = [...state.messages];
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === "assistant") {
          msgs[i] = { ...msgs[i], content: action.content };
          break;
        }
      }
      return { ...state, messages: msgs };
    }

    case "SET_TYPING":
      return { ...state, isTyping: action.isTyping };

    case "SET_LOADING":
      return { ...state, isLoading: action.isLoading };

    case "SET_ERROR":
      return { ...state, error: action.error };

    default:
      return state;
  }
}

// --- Context ---

const ChatContext = createContext<ChatContextValue | null>(null);

const ACTIVE_KEY = "tariq-active-conversation";

interface ChatProviderProps {
  userId: string;
  children: ReactNode;
}

export function ChatProvider({ userId, children }: ChatProviderProps) {
  const [state, dispatch] = useReducer(chatReducer, initialState);
  const abortRef = useRef<AbortController | null>(null);
  const initializedRef = useRef(false);
  const { preset } = useChatPreset();
  const presetRef = useRef(preset);
  useEffect(() => {
    presetRef.current = preset;
  }, [preset]);

  // --- Actions ---

  const loadConversations = useCallback(async () => {
    try {
      const { conversations } = await apiFetchConversations(userId);
      dispatch({ type: "SET_CONVERSATIONS", conversations, hasMore: false });
    } catch (err) {
      dispatch({
        type: "SET_ERROR",
        error: err instanceof Error ? err.message : "Failed to load conversations",
      });
    }
  }, [userId]);

  const setActive = useCallback(
    async (id: string) => {
      dispatch({ type: "SET_ACTIVE", id });
      dispatch({ type: "CLEAR_MESSAGES" });
      dispatch({ type: "SET_LOADING", isLoading: true });
      try {
        const { messages, hasMore } = await apiFetchMessages(userId, id);
        dispatch({ type: "SET_MESSAGES", messages, hasMore });
      } catch (err) {
        dispatch({
          type: "SET_ERROR",
          error: err instanceof Error ? err.message : "Failed to load messages",
        });
      } finally {
        dispatch({ type: "SET_LOADING", isLoading: false });
      }
    },
    [userId]
  );

  const sendMessage = useCallback(
    async (content: string) => {
      const currentActiveId = state.activeId;

      const userMsg: Message = {
        id: crypto.randomUUID(),
        role: "user",
        content,
        timestamp: new Date(),
      };
      dispatch({ type: "ADD_USER_MESSAGE", message: userMsg });
      dispatch({ type: "SET_TYPING", isTyping: true });

      const controller = new AbortController();
      abortRef.current = controller;

      let newConversationId: string | null = null;
      let accumulated = "";
      let assistantAdded = false;

      const difyQuery = buildDifyQuery(presetRef.current, content);

      try {
        for await (const event of streamChatMessage(
          userId,
          difyQuery,
          currentActiveId ?? undefined,
          controller.signal
        )) {
          if (event.type === "token") {
            accumulated += event.content;
            if (!assistantAdded) {
              dispatch({
                type: "ADD_ASSISTANT_MESSAGE",
                message: {
                  id: crypto.randomUUID(),
                  role: "assistant",
                  content: accumulated,
                  timestamp: new Date(),
                },
              });
              assistantAdded = true;
            } else {
              dispatch({ type: "UPDATE_LAST_MESSAGE", content: accumulated });
            }

            // Capture new conversation ID on first token when no active conversation
            if (!currentActiveId && !newConversationId) {
              newConversationId = event.conversationId;
            }
          }

          if (event.type === "end") {
            if (newConversationId) {
              dispatch({ type: "SET_ACTIVE", id: newConversationId });
              // Rename to user's plain text so the title doesn't leak the
              // preset marker baked into the wrapped Dify query.
              try {
                const trimmed = content.trim().replace(/\s+/g, " ").slice(0, 50);
                if (trimmed) {
                  await apiRenameConversation(newConversationId, trimmed);
                }
              } catch {
                // Best effort — sanitizeConversationTitle still hides any leak.
              }
              try {
                const { conversations } = await apiFetchConversations(userId);
                dispatch({ type: "SET_CONVERSATIONS", conversations, hasMore: false });
              } catch {
                // Non-critical — sidebar will refresh on next load
              }
            }
          }
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          dispatch({
            type: "SET_ERROR",
            error: err instanceof Error ? err.message : "Failed to send message",
          });
        }
      } finally {
        dispatch({ type: "SET_TYPING", isTyping: false });
        abortRef.current = null;
      }
    },
    [state.activeId, userId]
  );

  const deleteConversation = useCallback(
    async (id: string) => {
      // Optimistic removal (reducer atomically clears messages if active)
      dispatch({ type: "REMOVE_CONVERSATION", id });

      try {
        await apiDeleteConversation(userId, id);
      } catch {
        // Revert optimistic update by reloading from server
        try {
          const { conversations } = await apiFetchConversations(userId);
          dispatch({ type: "SET_CONVERSATIONS", conversations, hasMore: false });
        } catch {
          // If reload also fails, leave the optimistic state
        }
      }
    },
    [userId]
  );

  const newChat = useCallback(() => {
    // Abort any ongoing stream
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    dispatch({ type: "SET_ACTIVE", id: null });
    dispatch({ type: "CLEAR_MESSAGES" });
  }, []);

  const clearError = useCallback(() => {
    dispatch({ type: "SET_ERROR", error: null });
  }, []);

  // --- Initialization ---

  // Abort streaming on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    async function init() {
      try {
        const { conversations } = await apiFetchConversations(userId);
        dispatch({ type: "SET_CONVERSATIONS", conversations, hasMore: false });

        const savedId = localStorage.getItem(ACTIVE_KEY);
        if (savedId && conversations.some((c) => c.id === savedId)) {
          setActive(savedId);
        } else if (savedId) {
          localStorage.removeItem(ACTIVE_KEY);
        }
      } catch (err) {
        dispatch({
          type: "SET_ERROR",
          error: err instanceof Error ? err.message : "Failed to load conversations",
        });
      } finally {
        initializedRef.current = true;
      }
    }
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // --- Persist active conversation ID ---

  useEffect(() => {
    if (!initializedRef.current) return;
    if (state.activeId) {
      localStorage.setItem(ACTIVE_KEY, state.activeId);
    } else {
      localStorage.removeItem(ACTIVE_KEY);
    }
  }, [state.activeId]);

  // --- Derived ---

  const activeConversation = state.conversations.find((c) => c.id === state.activeId) ?? null;

  return (
    <ChatContext.Provider
      value={{
        conversations: state.conversations,
        activeConversation,
        messages: state.messages,
        isTyping: state.isTyping,
        isLoading: state.isLoading,
        error: state.error,
        loadConversations,
        setActive,
        sendMessage,
        deleteConversation,
        newChat,
        clearError,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

export function useChatContext() {
  const ctx = useContext(ChatContext);
  if (!ctx) {
    throw new Error("useChatContext must be used within ChatProvider");
  }
  return ctx;
}
