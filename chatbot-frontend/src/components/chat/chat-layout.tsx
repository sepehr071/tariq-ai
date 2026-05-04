"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { useTranslations, useLocale } from "next-intl";
import { Sidebar } from "@/components/chat/sidebar";
import { ChatArea } from "@/components/chat/chat-area";

export function ChatLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const t = useTranslations("app");
  const locale = useLocale();
  const sheetSide = locale === "fa" ? "right" : "left";

  return (
    <div className="flex h-full">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-72 shrink-0 border-e border-border">
        <Sidebar />
      </aside>

      {/* Mobile sidebar sheet */}
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <div className="md:hidden fixed top-3 start-3 z-50">
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="h-9 w-9">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
        </div>
        <SheetContent side={sheetSide} className="w-72 p-0">
          <SheetTitle className="sr-only">{t("title")}</SheetTitle>
          <Sidebar onNavigate={() => setSidebarOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* Chat area */}
      <main className="flex-1 min-w-0">
        <ChatArea />
      </main>
    </div>
  );
}
