"use client";

import { useTranslations } from "next-intl";
import { Plus, Settings, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useChatContext } from "@/context/chat-context";
import { SidebarItem } from "./sidebar-item";
import { SettingsDialog } from "@/components/settings-dialog";

interface SidebarProps {
  onNavigate?: () => void;
}

export function Sidebar({ onNavigate }: SidebarProps) {
  const t = useTranslations();
  const { conversations, activeConversation, newChat, setActive, deleteConversation } =
    useChatContext();

  const handleNewChat = () => {
    newChat();
    onNavigate?.();
  };

  const handleSelect = (id: string) => {
    setActive(id);
    onNavigate?.();
  };

  return (
    <div className="flex flex-col h-full w-full bg-sidebar text-sidebar-foreground">
      {/* Header */}
      <div className="p-4 space-y-3">
        <h1 className="text-lg font-semibold tracking-tight">{t("app.title")}</h1>
        <Button onClick={handleNewChat} className="w-full gap-2" size="sm">
          <Plus className="h-4 w-4" />
          {t("sidebar.newChat")}
        </Button>
      </div>

      <Separator />

      {/* Conversations list */}
      <div className="flex-1 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2">
          <span className="text-xs font-medium text-muted-foreground">
            {t("sidebar.conversations")}
          </span>
        </div>
        <ScrollArea className="h-full px-2">
          {conversations.length === 0 ? (
            <p className="text-sm text-muted-foreground px-2 py-4 text-center">
              {t("sidebar.noConversations")}
            </p>
          ) : (
            <div className="space-y-1 pb-4">
              {conversations.map((conv, index) => (
                <SidebarItem
                  key={conv.id}
                  conversation={conv}
                  isActive={activeConversation?.id === conv.id}
                  onClick={() => handleSelect(conv.id)}
                  onDelete={() => deleteConversation(conv.id)}
                  index={index}
                />
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      <Separator />

      {/* Footer */}
      <div className="p-3">
        <SettingsDialog>
          <button className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-sidebar-accent transition-colors">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="bg-primary/10 text-primary text-xs">
                <User className="h-4 w-4" />
              </AvatarFallback>
            </Avatar>
            <span className="flex-1 text-start truncate">{t("settings.profile")}</span>
            <Settings className="h-4 w-4 text-muted-foreground" />
          </button>
        </SettingsDialog>
      </div>
    </div>
  );
}
