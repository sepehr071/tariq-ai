"use client";

import { createElement, useEffect, useState, type ComponentType, type ReactNode } from "react";
import type { HTMLMotionProps } from "framer-motion";

// Lazy-loaded framer-motion primitives for landing-only components. The chat
// surface keeps its eager `motion` imports because Framer is critical to the
// streaming-message UX there; the landing route gets a dynamic chunk so its
// First Load JS no longer ships the ~50kB-gzipped animation runtime.
//
// On first render (SSR + initial hydration) we emit a plain HTML element so
// content is visible immediately and search engines see the markup. The
// effect kicks the dynamic import; once `framer-motion` resolves, we swap
// in the real motion component so subsequent renders use Framer for the
// animation pipeline.
//
// Result for landing: heading text is paint-eligible on the SSR pass
// (no FOUC, no invisible h1), and Framer-driven entrance animations run
// the moment the chunk arrives — the existing `delay`/`duration` values
// keep the same visual cadence because the chunk lands well before the
// first user-driven `whileInView`.

type MotionTag = "div" | "span" | "header" | "p";

const motionCache: Partial<Record<MotionTag, ComponentType<unknown>>> = {};
let motionLoaderPromise: Promise<typeof import("framer-motion")> | null = null;

function loadMotion(): Promise<typeof import("framer-motion")> {
  motionLoaderPromise ??= import("framer-motion");
  return motionLoaderPromise;
}

// Motion-only props that must be stripped before falling back to a plain
// HTML tag — otherwise React warns about unknown DOM attributes.
const MOTION_ONLY_PROP_KEYS = new Set([
  "initial",
  "animate",
  "exit",
  "transition",
  "variants",
  "whileHover",
  "whileTap",
  "whileInView",
  "whileFocus",
  "whileDrag",
  "viewport",
  "custom",
  "layoutId",
  "layout",
  "drag",
  "dragConstraints",
  "dragElastic",
  "dragMomentum",
  "onAnimationStart",
  "onAnimationComplete",
  "onUpdate",
]);

function stripMotionProps(props: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key in props) {
    if (!MOTION_ONLY_PROP_KEYS.has(key)) out[key] = props[key];
  }
  return out;
}

function createLazyMotion<Tag extends MotionTag>(
  tag: Tag
): ComponentType<HTMLMotionProps<Tag> & { children?: ReactNode }> {
  const LazyMotion = (props: HTMLMotionProps<Tag> & { children?: ReactNode }) => {
    const [Component, setComponent] = useState<ComponentType<unknown> | null>(
      () => motionCache[tag] ?? null
    );

    useEffect(() => {
      if (Component) return;
      let cancelled = false;
      loadMotion().then((mod) => {
        if (cancelled) return;
        const resolved = mod.motion[tag] as unknown as ComponentType<unknown>;
        motionCache[tag] = resolved;
        setComponent(() => resolved);
      });
      return () => {
        cancelled = true;
      };
    }, [Component]);

    if (Component) {
      return createElement(Component, props as unknown as Record<string, unknown>);
    }
    // Fallback: plain HTML tag with motion-only props stripped. Visible
    // immediately for SSR + first paint.
    const safeProps = stripMotionProps(props as unknown as Record<string, unknown>);
    return createElement(tag, safeProps);
  };
  LazyMotion.displayName = `LazyMotion(${tag})`;
  return LazyMotion;
}

export const MotionDiv = createLazyMotion("div");
export const MotionSpan = createLazyMotion("span");
export const MotionHeader = createLazyMotion("header");
export const MotionP = createLazyMotion("p");
