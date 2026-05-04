"use client";

import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { GradientBg } from "@/components/ui/gradient-bg";
import { ChatDemo } from "./chat-demo";
import { MotionDiv, MotionP, MotionSpan } from "./_motion";

export function HeroSection() {
  const t = useTranslations("landing.hero");

  const words = t("title").split(" ");

  return (
    <section className="relative min-h-[90dvh] overflow-hidden">
      <GradientBg />

      {/* Soft overlay for text readability */}
      <div className="absolute inset-0 -z-[5] bg-background/60 dark:bg-background/70" />

      <div className="mx-auto flex max-w-6xl flex-col items-center gap-12 px-4 pb-20 pt-24 sm:px-6 md:pt-32 lg:flex-row lg:gap-16 lg:px-8 lg:pt-36">
        {/* Text content */}
        <div className="flex flex-1 flex-col items-center text-center lg:items-start lg:text-start">
          {/* Staggered word reveal headline */}
          <h1 className="text-4xl font-bold leading-tight tracking-tight text-foreground sm:text-5xl lg:text-6xl">
            {words.map((word, i) => (
              <MotionSpan
                key={i}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.5,
                  delay: 0.3 + i * 0.1,
                  ease: "easeOut",
                }}
                className="inline-block"
              >
                {word}
                {i < words.length - 1 && "\u00A0"}
              </MotionSpan>
            ))}
          </h1>

          {/* Subtitle */}
          <MotionP
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.7, ease: "easeOut" }}
            className="mt-6 max-w-2xl text-lg text-muted-foreground sm:text-xl"
          >
            {t("subtitle")}
          </MotionP>

          {/* CTAs */}
          <MotionDiv
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.9, ease: "easeOut" }}
            className="mt-8 flex flex-wrap items-center gap-4"
          >
            <Button size="lg" asChild className="cursor-pointer gap-2 text-base">
              <Link href="/register">
                {t("cta")}
                <ArrowRight className="size-4" />
              </Link>
            </Button>

            <Button size="lg" variant="outline" asChild className="cursor-pointer text-base">
              <Link href="/login">{t("signIn")}</Link>
            </Button>
          </MotionDiv>
        </div>

        {/* Chat demo */}
        <MotionDiv
          initial={{ opacity: 0, scale: 0.95, y: 24 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.5, ease: "easeOut" }}
          className="w-full max-w-md flex-shrink-0"
        >
          <ChatDemo />
        </MotionDiv>
      </div>
    </section>
  );
}
