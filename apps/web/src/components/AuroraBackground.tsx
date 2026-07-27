"use client";

import { cn } from "@/lib/utils";

/**
 * Fixed aurora mesh + grain for the whole app (or auth full-bleed).
 * Decorative only — pointer-events none, respects reduced motion via CSS.
 */
export function AuroraLayer({ className }: { className?: string }) {
  return (
    <>
      <div className={cn("aurora-bg", className)} aria-hidden>
        <div className="aurora-blob aurora-blob-a" />
        <div className="aurora-blob aurora-blob-b" />
        <div className="aurora-blob aurora-blob-c" />
      </div>
      <div className="grain-overlay" aria-hidden />
    </>
  );
}

/**
 * Full-viewport wrapper used on auth / onboarding.
 */
export function AuroraBackground({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn("relative min-h-screen text-foreground", className)}>
      <AuroraLayer />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
