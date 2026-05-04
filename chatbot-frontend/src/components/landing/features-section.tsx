"use client";

import { useTranslations } from "next-intl";
import { BookOpen, Globe, Scale, Search } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { MotionDiv } from "./_motion";

const features = [
  { key: "sources", icon: BookOpen },
  { key: "fiqh", icon: Scale },
  { key: "multilingual", icon: Globe },
  { key: "search", icon: Search },
] as const;

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.12,
    },
  },
};

const cardVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: "easeOut" as const },
  },
};

export function FeaturesSection() {
  const t = useTranslations("landing.features");

  return (
    <section className="py-24 sm:py-32">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        {/* Section heading */}
        <MotionDiv
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="mb-16 text-center"
        >
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            {t("title")}
          </h2>
        </MotionDiv>

        {/* Feature grid */}
        <MotionDiv
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-60px" }}
          className="grid grid-cols-1 gap-6 sm:grid-cols-2"
        >
          {features.map(({ key, icon: Icon }) => (
            <MotionDiv key={key} variants={cardVariants}>
              <GlassCard className="group p-6 transition-shadow duration-300 hover:shadow-xl">
                <div className="flex flex-col gap-4">
                  {/* Icon */}
                  <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors duration-200 group-hover:bg-primary/20">
                    <Icon className="size-6" />
                  </div>

                  {/* Title */}
                  <h3 className="text-lg font-semibold text-foreground">{t(`${key}.title`)}</h3>

                  {/* Description */}
                  <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
                    {t(`${key}.description`)}
                  </p>
                </div>
              </GlassCard>
            </MotionDiv>
          ))}
        </MotionDiv>
      </div>
    </section>
  );
}
