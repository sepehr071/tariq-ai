"use client";

import { motion } from "framer-motion";
import { GradientBg } from "@/components/ui/gradient-bg";
import { GlassCard } from "@/components/ui/glass-card";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

interface AuthLayoutProps {
  children: ReactNode;
}

export function AuthLayout({ children }: AuthLayoutProps) {
  const t = useTranslations("app");

  return (
    <div className="relative flex min-h-dvh items-center justify-center p-4">
      <GradientBg />

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="w-full max-w-md"
      >
        <GlassCard className="px-8 py-10">
          {/* Logo / App Name */}
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-bold text-white">{t("title")}</h1>
          </div>

          {children}
        </GlassCard>
      </motion.div>
    </div>
  );
}
