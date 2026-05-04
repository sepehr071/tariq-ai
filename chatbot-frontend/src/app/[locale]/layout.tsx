import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getMessages } from "next-intl/server";
import { notFound } from "next/navigation";
import Script from "next/script";
import { ThemeProvider } from "next-themes";
import { Vazirmatn } from "next/font/google";
import { routing } from "@/i18n/routing";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/context/auth-context";

// next/font/google emits @font-face with the configured weights only and
// auto-injects a <link rel="preload"> for the primary subset — no manual
// preload needed. Five weights ate ~30% extra payload; dropped 300.
const vazirmatn = Vazirmatn({
  subsets: ["arabic", "latin"],
  variable: "--font-vazirmatn",
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
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

  // Root layout (`src/app/layout.tsx`) renders <html> without dir/lang because
  // it doesn't receive locale params in the App Router. Push them onto the
  // documentElement before paint so a single read of <html dir> is correct
  // for CSS/RTL libs and screen readers, instead of recomputing on the
  // wrapper <div> on every render. The wrapper still carries dir/lang as a
  // belt-and-suspenders fallback for any descendant that walks up to it.
  const setHtmlDirSrc = `document.documentElement.setAttribute("dir","${dir}");document.documentElement.setAttribute("lang","${locale}");`;

  return (
    <>
      <Script id="tariq-html-dir" strategy="beforeInteractive">
        {setHtmlDirSrc}
      </Script>
      <div lang={locale} dir={dir} className={`${vazirmatn.variable} font-sans h-dvh`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <NextIntlClientProvider locale={locale} messages={messages}>
            <AuthProvider>
              <TooltipProvider delayDuration={300}>{children}</TooltipProvider>
            </AuthProvider>
          </NextIntlClientProvider>
        </ThemeProvider>
      </div>
    </>
  );
}
