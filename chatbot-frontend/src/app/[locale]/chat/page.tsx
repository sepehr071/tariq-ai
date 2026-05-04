"use client";

import { useEffect } from "react";
import { useAuth } from "@/context/auth-context";
import { useRouter } from "@/i18n/navigation";
import { ChatProvider } from "@/context/chat-context";
import { ChatPresetProvider } from "@/context/chat-preset-context";
import { ChatLayout } from "@/components/chat/chat-layout";

export default function ChatPage() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isAuthenticated && !isLoading) {
      router.replace("/login");
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-dvh">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return null;
  }

  return (
    <ChatPresetProvider>
      <ChatProvider userId={user.id}>
        <ChatLayout />
      </ChatProvider>
    </ChatPresetProvider>
  );
}
