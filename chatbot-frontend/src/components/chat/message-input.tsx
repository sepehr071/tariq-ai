"use client";

import { useState, useRef, useCallback } from "react";
import { useTranslations } from "next-intl";
import { SendHorizonal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useChatContext } from "@/context/chat-context";

export function MessageInput() {
  const t = useTranslations("chat");
  const { sendMessage, isTyping } = useChatContext();
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
    }
  }, []);

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (!trimmed || isTyping) return;
    sendMessage(trimmed);
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

  return (
    <div className="flex items-end gap-2 rounded-3xl shadow-lg bg-card/90 backdrop-blur-sm border border-border/50 p-3 focus-within:ring-2 focus-within:ring-ring/30 transition-all">
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
        className="flex-1 resize-none bg-transparent text-sm leading-relaxed px-2 py-1.5 focus:outline-none placeholder:text-muted-foreground disabled:opacity-50"
      />
      <Button
        size="icon"
        className="h-9 w-9 shrink-0 rounded-xl"
        onClick={handleSubmit}
        disabled={!value.trim() || isTyping}
      >
        <SendHorizonal className="h-4 w-4" />
      </Button>
    </div>
  );
}
