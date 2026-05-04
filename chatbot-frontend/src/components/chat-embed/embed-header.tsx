"use client";

import { useTranslations } from "next-intl";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEmbedChatContext } from "@/context/embed-chat-context";

interface EmbedHeaderProps {
  title: string;
}

export function EmbedHeader({ title }: EmbedHeaderProps) {
  const t = useTranslations("embed");
  const { reset } = useEmbedChatContext();

  const handleClose = () => {
    if (typeof window === "undefined") return;
    if (window.parent === window) return;
    window.parent.postMessage({ type: "tariq:widget:closeRequested" }, "*");
  };

  return (
    <header className="flex items-center justify-between gap-2 border-b border-border bg-card/80 backdrop-blur-sm px-4 py-3">
      <div className="flex items-center gap-2 min-w-0">
        <div className="h-2 w-2 rounded-full bg-primary shrink-0" aria-hidden />
        <h1 className="text-sm font-semibold text-foreground truncate">{title}</h1>
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={reset}
          aria-label={t("newChat")}
          title={t("newChat")}
        >
          <Plus className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={handleClose}
          aria-label={t("close")}
          title={t("close")}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
