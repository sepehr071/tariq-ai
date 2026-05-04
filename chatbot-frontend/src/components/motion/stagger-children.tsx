"use client";

import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import { Children } from "react";

interface StaggerChildrenProps {
  staggerDelay?: number;
  className?: string;
  children: ReactNode;
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: (staggerDelay: number) => ({
    opacity: 1,
    transition: {
      staggerChildren: staggerDelay,
    },
  }),
};

const childVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: "easeOut" as const },
  },
};

export function StaggerChildren({ staggerDelay = 0.1, className, children }: StaggerChildrenProps) {
  return (
    <AnimatePresence>
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        custom={staggerDelay}
        className={cn(className)}
      >
        {Children.map(children, (child) => (
          <motion.div variants={childVariants}>{child}</motion.div>
        ))}
      </motion.div>
    </AnimatePresence>
  );
}
