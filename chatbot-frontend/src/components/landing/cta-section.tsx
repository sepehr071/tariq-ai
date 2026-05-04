"use client";

import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { MotionDiv } from "./_motion";

export function CTASection() {
  const t = useTranslations("landing.cta");

  return (
    <section className="px-4 py-24 sm:px-6 sm:py-32 lg:px-8">
      <MotionDiv
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="mx-auto max-w-3xl overflow-hidden rounded-3xl p-10 text-center sm:p-16"
        style={{
          background:
            "linear-gradient(135deg, oklch(0.655 0.1 175) 0%, oklch(0.55 0.12 195) 40%, oklch(0.5 0.1 210) 70%, oklch(0.65 0.1 85) 100%)",
        }}
      >
        <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">{t("title")}</h2>

        <p className="mx-auto mt-4 max-w-xl text-lg text-white/80">{t("subtitle")}</p>

        <div className="mt-8">
          <Button
            size="lg"
            asChild
            className="cursor-pointer gap-2 border border-white/20 bg-white text-base font-semibold text-primary hover:bg-white/90"
          >
            <Link href="/register">
              {t("button")}
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </MotionDiv>
    </section>
  );
}
