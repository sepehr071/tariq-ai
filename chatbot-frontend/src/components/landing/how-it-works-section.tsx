"use client";

import { Fragment } from "react";
import { useTranslations } from "next-intl";
import { MessageCircleQuestion, BookOpenCheck, Sparkles } from "lucide-react";
import { MotionDiv } from "./_motion";

const steps = [
  { key: "step1", icon: MessageCircleQuestion, num: 1 },
  { key: "step2", icon: BookOpenCheck, num: 2 },
  { key: "step3", icon: Sparkles, num: 3 },
] as const;

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15,
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

export function HowItWorksSection() {
  const t = useTranslations("landing.howItWorks");

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
          <div className="islamic-divider mx-auto mt-4 max-w-xs" />
        </MotionDiv>

        {/* Steps */}
        <MotionDiv
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-60px" }}
          className="mt-16 flex flex-col items-center gap-12 md:flex-row md:items-start md:gap-0"
        >
          {steps.map((step, i) => (
            <Fragment key={step.key}>
              {/* Step card */}
              <MotionDiv
                variants={cardVariants}
                className="flex flex-1 flex-col items-center text-center"
              >
                {/* Step number */}
                <div className="flex size-12 items-center justify-center rounded-full bg-[oklch(0.78_0.14_85)]/15 text-[oklch(0.78_0.14_85)] dark:bg-[oklch(0.82_0.12_85)]/15 dark:text-[oklch(0.82_0.12_85)]">
                  <span className="text-lg font-bold">{step.num}</span>
                </div>

                {/* Icon */}
                <div className="mt-4 flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <step.icon className="size-7" />
                </div>

                {/* Title */}
                <h3 className="mt-4 text-lg font-semibold text-foreground">
                  {t(`${step.key}.title`)}
                </h3>

                {/* Description */}
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {t(`${step.key}.description`)}
                </p>
              </MotionDiv>

              {/* Connector between steps (desktop only) */}
              {i < steps.length - 1 && (
                <div className="hidden md:flex md:items-center md:pt-10 md:px-2">
                  <div className="w-8 border-t-2 border-dashed border-primary/30" />
                </div>
              )}
            </Fragment>
          ))}
        </MotionDiv>
      </div>
    </section>
  );
}
