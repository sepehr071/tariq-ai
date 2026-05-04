import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getMessages } from "next-intl/server";
import { notFound } from "next/navigation";
import { ThemeProvider } from "next-themes";
import { routing } from "@/i18n/routing";
import { TooltipProvider } from "@/components/ui/tooltip";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

// Locale-scoped layout for the embed panel. Only safe-for-anonymous providers:
// Theme + i18n + Tooltip. No AuthProvider.
export default async function EmbedLocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  const messages = await getMessages({ locale });
  const dir = locale === "fa" ? "rtl" : "ltr";

  return (
    <div lang={locale} dir={dir} className="h-full w-full">
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <TooltipProvider delayDuration={300}>{children}</TooltipProvider>
        </NextIntlClientProvider>
      </ThemeProvider>
    </div>
  );
}
