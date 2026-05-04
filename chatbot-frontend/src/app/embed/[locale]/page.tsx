"use client";

import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { AlertTriangle } from "lucide-react";
import { EmbedChatProvider } from "@/context/embed-chat-context";
import { EmbedChat } from "@/components/chat-embed/embed-chat";

export default function EmbedPage() {
  const t = useTranslations("embed");
  const searchParams = useSearchParams();

  const appId = searchParams.get("app")?.trim() ?? "";
  const greeting = searchParams.get("greeting");

  if (!appId) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-background px-6 text-center text-foreground">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/10">
          <AlertTriangle className="h-6 w-6 text-destructive" />
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">{t("errorUnknownApp")}</p>
      </div>
    );
  }

  // Human-readable title: hyphenated ids → spaced + title-cased.
  const appTitle = appId
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <EmbedChatProvider appId={appId}>
      <EmbedChat appTitle={appTitle} greeting={greeting} />
    </EmbedChatProvider>
  );
}
