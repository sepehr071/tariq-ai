"use client";

import { useTranslations } from "next-intl";
import { Bot } from "lucide-react";

export function TypingIndicator() {
  const t = useTranslations("chat");

  return (
    <div className="flex gap-3 animate-in fade-in duration-300">
      <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
        <Bot className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="flex flex-col gap-1 items-start">
        <span className="text-xs font-medium text-muted-foreground px-1">Tariq AI</span>
        <div className="rounded-2xl rounded-es-md bg-card border border-border px-4 py-3 flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:0ms]" />
          <span className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:150ms]" />
          <span className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:300ms]" />
          <span className="text-xs text-muted-foreground ms-2">{t("thinking")}</span>
        </div>
      </div>
    </div>
  );
}
