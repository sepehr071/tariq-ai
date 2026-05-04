"use client";

import { useTranslations } from "next-intl";
import { Bot } from "lucide-react";
import { useChatContext } from "@/context/chat-context";
import { FadeIn } from "@/components/motion/fade-in";
import { MessageList } from "./message-list";
import { MessageInput } from "./message-input";

export function ChatArea() {
  const t = useTranslations("chat");
  const { messages, isTyping, isLoading, error, clearError } = useChatContext();

  return (
    <div className="flex flex-col h-full">
      {/* Error banner */}
      {error && (
        <div className="mx-4 mt-2 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-center justify-between">
          <span>{error}</span>
          <button onClick={clearError} className="text-xs underline ms-4">
            {t("dismiss")}
          </button>
        </div>
      )}

      {/* Messages */}
      {isLoading ? (
        <div className="flex-1 overflow-y-auto">
          <div className="flex items-center justify-center h-full min-h-[60vh]">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        </div>
      ) : messages.length === 0 ? (
        <div className="flex-1 overflow-y-auto">
          <FadeIn
            direction="up"
            duration={0.6}
            className="flex flex-col items-center justify-center h-full min-h-[60vh] gap-4 text-center px-4"
          >
            <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Bot className="h-7 w-7 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-semibold mb-1">{t("welcome")}</h2>
              <p className="text-muted-foreground text-sm">{t("welcomeSubtitle")}</p>
            </div>
          </FadeIn>
        </div>
      ) : (
        <MessageList messages={messages} isTyping={isTyping} />
      )}

      {/* Input */}
      <div
        className="sticky bottom-0 px-4 pb-4 pt-6 bg-gradient-to-t from-background from-80% to-transparent pointer-events-none [contain:layout_style] [will-change:transform]"
      >
        <div className="max-w-3xl mx-auto pointer-events-auto">
          <MessageInput />
        </div>
      </div>
    </div>
  );
}
