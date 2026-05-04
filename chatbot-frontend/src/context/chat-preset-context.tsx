"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_PRESET,
  PRESET_STORAGE_KEY,
  parseStoredPreset,
  type ChatPreset,
  type PresetMode,
} from "@/lib/chat-preset";

interface ChatPresetContextValue {
  preset: ChatPreset;
  setMode: (mode: PresetMode) => void;
  setExtra: (extra: string) => void;
  reset: () => void;
}

const ChatPresetContext = createContext<ChatPresetContextValue | null>(null);

export function ChatPresetProvider({ children }: { children: ReactNode }) {
  const [preset, setPreset] = useState<ChatPreset>(DEFAULT_PRESET);
  const initializedRef = useRef(false);

  useEffect(() => {
    try {
      setPreset(parseStoredPreset(localStorage.getItem(PRESET_STORAGE_KEY)));
    } catch {
      setPreset(DEFAULT_PRESET);
    } finally {
      initializedRef.current = true;
    }
  }, []);

  useEffect(() => {
    if (!initializedRef.current) return;
    try {
      localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(preset));
    } catch {
      // ignore quota/unavailable
    }
  }, [preset]);

  const setMode = useCallback((mode: PresetMode) => {
    setPreset((prev) => ({ ...prev, mode }));
  }, []);

  const setExtra = useCallback((extra: string) => {
    setPreset((prev) => ({ ...prev, extra }));
  }, []);

  const reset = useCallback(() => {
    setPreset(DEFAULT_PRESET);
  }, []);

  return (
    <ChatPresetContext.Provider value={{ preset, setMode, setExtra, reset }}>
      {children}
    </ChatPresetContext.Provider>
  );
}

export function useChatPreset() {
  const ctx = useContext(ChatPresetContext);
  if (!ctx) {
    throw new Error("useChatPreset must be used within ChatPresetProvider");
  }
  return ctx;
}
