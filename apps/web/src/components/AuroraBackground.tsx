"use client";

import { cn } from "@/lib/utils";

/**
 * Deep green → indigo → violet mesh for auth / onboarding.
 * Respects prefers-reduced-motion (static blobs only).
 */
export function AuroraBackground({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        // Never overflow-hidden on full-screen shells — clips tall onboarding on mobile
        "relative min-h-screen overflow-x-hidden overflow-y-auto bg-[oklch(0.12_0.02_160)] text-foreground",
        className
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 min-h-full bg-[radial-gradient(ellipse_at_20%_20%,oklch(0.35_0.12_160/0.45),transparent_55%),radial-gradient(ellipse_at_80%_10%,oklch(0.32_0.14_280/0.4),transparent_50%),radial-gradient(ellipse_at_50%_90%,oklch(0.28_0.12_310/0.35),transparent_55%)]"
      />
      <div
        aria-hidden
        className="aurora-blob aurora-blob-a absolute -left-24 top-10 h-72 w-72 rounded-full bg-[oklch(0.45_0.16_160/0.35)] blur-3xl will-change-transform"
      />
      <div
        aria-hidden
        className="aurora-blob aurora-blob-b absolute -right-16 bottom-8 h-80 w-80 rounded-full bg-[oklch(0.4_0.16_290/0.3)] blur-3xl will-change-transform"
      />
      <div className="relative z-10 min-h-screen">{children}</div>
    </div>
  );
}
