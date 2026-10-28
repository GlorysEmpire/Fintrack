"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The app's one way to explain or define something: a small (i) button that
 * opens a short note on tap, click, Enter or Space and closes on Escape, a tap
 * elsewhere, or the button again. Explanations never sit inline as text.
 */
export function InfoTip({
  label,
  children,
  align = "start",
  className,
}: {
  /** What this explains, for screen readers: "About safe to spend" */
  label: string;
  children: React.ReactNode;
  /** Which edge of the button the note lines up with */
  align?: "start" | "end";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span ref={root} className={cn("relative inline-flex align-middle", className)}>
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "relative flex h-6 w-6 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors",
          "after:absolute after:-inset-2 after:content-['']",
          "hover:border-primary/50 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          open && "border-primary/60 bg-primary/10 text-primary"
        )}
      >
        <Info className="h-3.5 w-3.5" aria-hidden />
      </button>
      {open && (
        <span
          id={id}
          role="note"
          className={cn(
            "absolute top-full z-40 mt-2 w-[min(18rem,calc(100vw-3rem))] rounded-xl border border-border bg-[var(--surface-elevated)] p-3 text-left text-sm font-normal normal-case leading-snug tracking-normal text-foreground shadow-[var(--shadow-glass)]",
            align === "end" ? "right-0" : "left-0"
          )}
        >
          {children}
        </span>
      )}
    </span>
  );
}
