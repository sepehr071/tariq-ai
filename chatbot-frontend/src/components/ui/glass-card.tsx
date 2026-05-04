"use client";

import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface GlassCardProps {
  className?: string;
  children: ReactNode;
}

export function GlassCard({ className, children }: GlassCardProps) {
  return (
    <div
      className={cn(
        "backdrop-blur-xl bg-white/10 dark:bg-white/5 border border-white/20 rounded-2xl shadow-2xl",
        className
      )}
    >
      {children}
    </div>
  );
}
