"use client";

import { cn } from "@/lib/utils";

export function GradientBg({ className }: { className?: string }) {
  return (
    <div className={cn("fixed inset-0 -z-10 overflow-hidden", className)}>
      {/* Primary gradient mesh */}
      <div
        className="absolute inset-0 animate-gradient opacity-80 dark:opacity-60"
        style={{
          background:
            "linear-gradient(135deg, oklch(0.655 0.1 175) 0%, oklch(0.5 0.15 280) 33%, oklch(0.55 0.12 230) 66%, oklch(0.655 0.1 175) 100%)",
          backgroundSize: "200% 200%",
        }}
      />

      {/* Radial overlay for depth */}
      <div
        className="absolute inset-0 opacity-40 dark:opacity-30"
        style={{
          background:
            "radial-gradient(ellipse at 20% 50%, oklch(0.7 0.12 175 / 60%) 0%, transparent 50%), radial-gradient(ellipse at 80% 20%, oklch(0.6 0.15 280 / 40%) 0%, transparent 50%), radial-gradient(ellipse at 50% 80%, oklch(0.55 0.1 230 / 50%) 0%, transparent 50%)",
        }}
      />

      {/* Noise texture overlay for subtle grain */}
      <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05] mix-blend-overlay bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMDAiIGhlaWdodD0iMzAwIj48ZmlsdGVyIGlkPSJhIj48ZmVUdXJidWxlbmNlIHR5cGU9ImZyYWN0YWxOb2lzZSIgYmFzZUZyZXF1ZW5jeT0iLjc1IiBzdGl0Y2hUaWxlcz0ic3RpdGNoIi8+PC9maWx0ZXI+PHJlY3Qgd2lkdGg9IjMwMCIgaGVpZ2h0PSIzMDAiIGZpbHRlcj0idXJsKCNhKSIgb3BhY2l0eT0iMC4wNSIvPjwvc3ZnPg==')]" />
    </div>
  );
}
