"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from "react";
import { EmbedAuthRequiredError, streamEmbedChatMessage } from "@/lib/embed-api";
import { randomId } from "@/lib/utils";

// --- Types ---

export interface EmbedMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface EmbedChatState {
  messages: EmbedMessage[];
  isTyping: boolean;
  error: string | null;
  anonId: string | null;
  conversationId: string | null;
}

type EmbedChatAction =
  | { type: "SET_IDENTITY"; anonId: string; conversationId: string | null }
  | { type: "ADD_USER_MESSAGE"; message: EmbedMessage }
  | { type: "ADD_ASSISTANT_MESSAGE"; message: EmbedMessage }
  | { type: "UPDATE_LAST_MESSAGE"; content: string }
  | { type: "SET_TYPING"; isTyping: boolean }
  | { type: "SET_ERROR"; error: string | null }
  | { type: "SET_CONVERSATION_ID"; conversationId: string | null }
  | { type: "RESET" };

interface EmbedChatContextValue {
  appId: string;
  messages: EmbedMessage[];
  isTyping: boolean;
  error: string | null;
  conversationId: string | null;
  sendMessage: (text: string) => Promise<void>;
  reset: () => void;
  clearError: () => void;
}

const EmbedChatContext = createContext<EmbedChatContextValue | null>(null);

const ANON_ID_KEY = "tariq_embed_anon_id";
const CONV_KEY_PREFIX = "tariq_embed_conv_";

// --- Reducer ---

const initialState: EmbedChatState = {
  messages: [],
  isTyping: false,
  error: null,
  anonId: null,
  conversationId: null,
};

function embedChatReducer(state: EmbedChatState, action: EmbedChatAction): EmbedChatState {
  switch (action.type) {
    case "SET_IDENTITY":
      return { ...state, anonId: action.anonId, conversationId: action.conversationId };
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
    case "SET_ERROR":
      return { ...state, error: action.error };
    case "SET_CONVERSATION_ID":
      return { ...state, conversationId: action.conversationId };
    case "RESET":
      return { ...state, messages: [], conversationId: null, error: null, isTyping: false };
    default:
      return state;
  }
}

// --- Origin allowlist ---

function isOriginAllowed(origin: string, allowlist: string[]): boolean {
  if (process.env.NODE_ENV !== "production" && allowlist.includes("*")) return true;
  return allowlist.includes(origin);
}

// --- Provider ---

interface EmbedChatProviderProps {
  appId: string;
  children: ReactNode;
}

export function EmbedChatProvider({ appId, children }: EmbedChatProviderProps) {
  const [state, dispatch] = useReducer(embedChatReducer, initialState);
  const abortRef = useRef<AbortController | null>(null);
  const identityReadyRef = useRef(false);
  // Host-site Keycloak token, pushed from launcher via postMessage. In-memory
  // only — never persisted, so it cannot leak across host sites that share the
  // iframe origin.
  const tokenRef = useRef<string | null>(null);
  // Validated parent origin used as targetOrigin for outbound postMessages.
  // Null when no trusted origin is known — outbound messages are dropped
  // rather than broadcast with "*".
  const parentOriginRef = useRef<string | null>(null);

  // Origin allowlist: compute once from document.referrer + dev fallback.
  const allowlist = useMemo(() => {
    const list: string[] = [];
    if (typeof window !== "undefined" && document.referrer) {
      try {
        list.push(new URL(document.referrer).origin);
      } catch {
        // ignore malformed referrer
      }
    }
    if (process.env.NODE_ENV !== "production") {
      list.push("*");
    }
    return list;
  }, []);

  // Resolve the parent origin once on mount: read the `origin` query param
  // (set by the launcher) and validate it against the same allowlist used
  // for inbound messages. Falls back to document.referrer's origin in dev
  // for compatibility with hand-rolled embed URLs.
  useEffect(() => {
    if (typeof window === "undefined") return;

    const readOrigin = (): string | null => {
      try {
        const param = new URL(window.location.href).searchParams.get("origin");
        if (!param) return null;
        const parsed = new URL(param);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
          return null;
        }
        return parsed.origin;
      } catch {
        return null;
      }
    };

    let origin = readOrigin();

    if (!origin && process.env.NODE_ENV !== "production" && document.referrer) {
      try {
        origin = new URL(document.referrer).origin;
      } catch {
        origin = null;
      }
    }

    if (origin && isOriginAllowed(origin, allowlist)) {
      parentOriginRef.current = origin;
    } else {
      parentOriginRef.current = null;
    }
  }, [allowlist]);

  // Send a message to the parent launcher using the validated origin. If
  // no trusted origin is known, drop the message rather than leak state
  // via targetOrigin "*".
  const postToParent = useCallback((payload: Record<string, unknown>) => {
    if (typeof window === "undefined") return;
    if (window.parent === window) return;
    const target = parentOriginRef.current;
    if (!target) return;
    window.parent.postMessage(payload, target);
  }, []);

  // Read/generate identity on mount.
  useEffect(() => {
    if (typeof window === "undefined") return;

    let anonId = window.localStorage.getItem(ANON_ID_KEY);
    // Backend requires the anon_ prefix; regenerate if stored value is malformed
    // (e.g. from an earlier build that stored a raw UUID).
    if (!anonId || !anonId.startsWith("anon_")) {
      anonId = `anon_${randomId()}`;
      window.localStorage.setItem(ANON_ID_KEY, anonId);
    }

    const conversationId = window.localStorage.getItem(`${CONV_KEY_PREFIX}${appId}`);
    dispatch({ type: "SET_IDENTITY", anonId, conversationId });
    identityReadyRef.current = true;
  }, [appId]);

  // Persist conversation id whenever it changes (after init).
  useEffect(() => {
    if (!identityReadyRef.current || typeof window === "undefined") return;
    const key = `${CONV_KEY_PREFIX}${appId}`;
    if (state.conversationId) {
      window.localStorage.setItem(key, state.conversationId);
    } else {
      window.localStorage.removeItem(key);
    }
  }, [appId, state.conversationId]);

  // --- Actions ---

  const clearError = useCallback(() => {
    dispatch({ type: "SET_ERROR", error: null });
  }, []);

  const reset = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    dispatch({ type: "RESET" });
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      if (!state.anonId) return;

      const userMsg: EmbedMessage = {
        id: randomId(),
        role: "user",
        content: trimmed,
        timestamp: new Date(),
      };
      dispatch({ type: "ADD_USER_MESSAGE", message: userMsg });
      dispatch({ type: "SET_TYPING", isTyping: true });
      dispatch({ type: "SET_ERROR", error: null });

      const controller = new AbortController();
      abortRef.current = controller;

      let accumulated = "";
      let assistantAdded = false;
      let capturedConvId: string | null = null;
      let firstTokenNotified = false;

      try {
        for await (const event of streamEmbedChatMessage({
          app: appId,
          user: state.anonId,
          query: trimmed,
          conversationId: state.conversationId ?? undefined,
          token: tokenRef.current ?? undefined,
          signal: controller.signal,
        })) {
          if (event.type === "token") {
            accumulated += event.content;
            if (!assistantAdded) {
              dispatch({
                type: "ADD_ASSISTANT_MESSAGE",
                message: {
                  id: randomId(),
                  role: "assistant",
                  content: accumulated,
                  timestamp: new Date(),
                },
              });
              assistantAdded = true;
            } else {
              dispatch({ type: "UPDATE_LAST_MESSAGE", content: accumulated });
            }

            if (!capturedConvId && event.conversationId) {
              capturedConvId = event.conversationId;
              dispatch({ type: "SET_CONVERSATION_ID", conversationId: capturedConvId });
            }

            if (!firstTokenNotified) {
              postToParent({ type: "tariq:widget:messageReceived" });
              firstTokenNotified = true;
            }
          }

          if (event.type === "end") {
            if (!capturedConvId && event.conversationId) {
              capturedConvId = event.conversationId;
              dispatch({ type: "SET_CONVERSATION_ID", conversationId: capturedConvId });
            }
          }
        }
      } catch (err) {
        if (err instanceof EmbedAuthRequiredError) {
          dispatch({ type: "SET_ERROR", error: "Authentication required" });
          postToParent({ type: "tariq:widget:authRequired" });
        } else if ((err as Error).name !== "AbortError") {
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
    [appId, state.anonId, state.conversationId, postToParent]
  );

  // Abort on unmount.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // postMessage listener from parent launcher.
  useEffect(() => {
    if (typeof window === "undefined") return;

    function onMessage(event: MessageEvent) {
      if (!isOriginAllowed(event.origin, allowlist)) return;
      const data = event.data as { type?: string; text?: string; token?: string } | null;
      if (!data || typeof data.type !== "string") return;

      switch (data.type) {
        case "tariq:host:sendMessage":
          if (typeof data.text === "string") {
            void sendMessage(data.text);
          }
          break;
        case "tariq:host:reset":
          reset();
          break;
        case "tariq:host:token":
          if (typeof data.token === "string" && data.token.length > 0) {
            tokenRef.current = data.token;
          }
          break;
        case "tariq:host:clearToken":
          tokenRef.current = null;
          break;
        default:
          break;
      }
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [allowlist, reset, sendMessage]);

  // Announce readiness exactly once. Runs after parentOriginRef has been
  // resolved by the mount-time effect above; if no trusted origin was found,
  // postToParent is a no-op (we'd rather drop the ready signal than leak it).
  useEffect(() => {
    postToParent({ type: "tariq:widget:ready" });
  }, [postToParent]);

  const value = useMemo<EmbedChatContextValue>(
    () => ({
      appId,
      messages: state.messages,
      isTyping: state.isTyping,
      error: state.error,
      conversationId: state.conversationId,
      sendMessage,
      reset,
      clearError,
    }),
    [
      appId,
      state.messages,
      state.isTyping,
      state.error,
      state.conversationId,
      sendMessage,
      reset,
      clearError,
    ]
  );

  return <EmbedChatContext.Provider value={value}>{children}</EmbedChatContext.Provider>;
}

export function useEmbedChatContext() {
  const ctx = useContext(EmbedChatContext);
  if (!ctx) {
    throw new Error("useEmbedChatContext must be used within EmbedChatProvider");
  }
  return ctx;
}
