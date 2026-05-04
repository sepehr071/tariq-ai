"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { Menu, Sun, Moon, X } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { MotionHeader } from "./_motion";

export function Navbar() {
  const t = useTranslations();
  const { resolvedTheme, setTheme } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);

  const toggleTheme = () => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  };

  return (
    <MotionHeader
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="sticky top-0 z-50 w-full backdrop-blur-md bg-background/80 border-b border-border/50"
    >
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Logo */}
        <Link
          href="/"
          className="cursor-pointer text-xl font-bold text-foreground transition-colors duration-200 hover:text-primary"
        >
          {t("app.title")}
        </Link>

        {/* Desktop nav */}
        <div className="hidden items-center gap-3 md:flex">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            className="cursor-pointer"
            aria-label="Toggle theme"
          >
            <Sun className="size-5 scale-100 rotate-0 transition-transform duration-200 dark:scale-0 dark:-rotate-90" />
            <Moon className="absolute size-5 scale-0 rotate-90 transition-transform duration-200 dark:scale-100 dark:rotate-0" />
          </Button>

          <Button variant="ghost" asChild className="cursor-pointer">
            <Link href="/login">{t("landing.nav.login")}</Link>
          </Button>

          <Button asChild className="cursor-pointer">
            <Link href="/register">{t("landing.nav.register")}</Link>
          </Button>
        </div>

        {/* Mobile nav */}
        <div className="flex items-center gap-2 md:hidden">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            className="cursor-pointer"
            aria-label="Toggle theme"
          >
            <Sun className="size-5 scale-100 rotate-0 transition-transform duration-200 dark:scale-0 dark:-rotate-90" />
            <Moon className="absolute size-5 scale-0 rotate-90 transition-transform duration-200 dark:scale-100 dark:rotate-0" />
          </Button>

          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="cursor-pointer" aria-label="Open menu">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" showCloseButton={false} className="w-64">
              <SheetTitle className="sr-only">Navigation menu</SheetTitle>
              <div className="flex flex-col gap-4 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-lg font-bold text-foreground">{t("app.title")}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setMobileOpen(false)}
                    className="cursor-pointer"
                    aria-label="Close menu"
                  >
                    <X className="size-5" />
                  </Button>
                </div>

                <div className="flex flex-col gap-2 pt-4">
                  <Button
                    variant="ghost"
                    asChild
                    className="w-full cursor-pointer justify-start"
                    onClick={() => setMobileOpen(false)}
                  >
                    <Link href="/login">{t("landing.nav.login")}</Link>
                  </Button>

                  <Button
                    asChild
                    className="w-full cursor-pointer"
                    onClick={() => setMobileOpen(false)}
                  >
                    <Link href="/register">{t("landing.nav.register")}</Link>
                  </Button>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </nav>
    </MotionHeader>
  );
}
