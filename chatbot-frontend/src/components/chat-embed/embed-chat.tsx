"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { Bot, SendHorizonal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MessageBubble } from "@/components/chat/message-bubble";
import { TypingIndicator } from "@/components/chat/typing-indicator";
import { useEmbedChatContext } from "@/context/embed-chat-context";
import { EmbedHeader } from "./embed-header";

interface EmbedChatProps {
  appTitle: string;
  greeting?: string | null;
}

export function EmbedChat({ appTitle, greeting }: EmbedChatProps) {
  const t = useTranslations("embed");
  const { messages, isTyping, error, sendMessage, clearError } = useEmbedChatContext();

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState("");

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 140)}px`;
    }
  }, []);

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (!trimmed || isTyping) return;
    void sendMessage(trimmed);
    setValue("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const greetingText = greeting?.trim() || t("greeting");

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="flex h-full w-full flex-col bg-background text-foreground"
    >
      <EmbedHeader title={appTitle} />

      {error && (
        <div className="mx-3 mt-2 flex items-center justify-between rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <span className="truncate">{error}</span>
          <button onClick={clearError} className="ms-3 text-[11px] underline">
            {t("close")}
          </button>
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="flex h-full min-h-[60%] flex-col items-center justify-center gap-3 px-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
              <Bot className="h-6 w-6 text-primary" />
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">{greetingText}</p>
          </div>
        ) : (
          <div className="mx-auto w-full max-w-2xl space-y-4 px-3 py-4 pb-24">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
            {isTyping && messages[messages.length - 1]?.role !== "assistant" && <TypingIndicator />}
          </div>
        )}
      </div>

      {/* Floating island input */}
      <div className="pointer-events-none sticky bottom-0 bg-gradient-to-t from-background from-70% to-transparent px-3 pb-3 pt-6">
        <div className="pointer-events-auto mx-auto w-full max-w-2xl">
          <div className="flex items-end gap-2 rounded-3xl border border-border/50 bg-card/90 p-2.5 shadow-lg backdrop-blur-sm transition-all focus-within:ring-2 focus-within:ring-ring/30">
            <textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                adjustHeight();
              }}
              onKeyDown={handleKeyDown}
              placeholder={t("placeholder")}
              disabled={isTyping}
              rows={1}
              className="flex-1 resize-none bg-transparent px-2 py-1.5 text-sm leading-relaxed placeholder:text-muted-foreground focus:outline-none disabled:opacity-50"
            />
            <Button
              size="icon"
              className="h-8 w-8 shrink-0 rounded-xl"
              onClick={handleSubmit}
              disabled={!value.trim() || isTyping}
              aria-label={t("placeholder")}
            >
              <SendHorizonal className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
