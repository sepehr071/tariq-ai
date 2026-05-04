"use client";

import { useTranslations } from "next-intl";

export function Footer() {
  const t = useTranslations("landing.footer");

  return (
    <footer className="border-t border-border/50 py-8">
      <div className="mx-auto max-w-6xl px-4 text-center sm:px-6 lg:px-8">
        <p className="text-sm text-muted-foreground">{t("copyright")}</p>
      </div>
    </footer>
  );
}
