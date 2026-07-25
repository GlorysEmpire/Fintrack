"use client";

/**
 * Minimal toast helper — queue + listen for simple notifications.
 * Full sonner not required; keeps dependency surface small.
 */
import * as React from "react";
import { cn } from "@/lib/utils";

type Toast = { id: number; title: string; variant?: "default" | "error" };

let seq = 0;
const listeners = new Set<(t: Toast | null) => void>();

export function toast(title: string, variant: Toast["variant"] = "default") {
  const t = { id: ++seq, title, variant };
  listeners.forEach((l) => l(t));
  setTimeout(() => listeners.forEach((l) => l(null)), 3200);
}

export function Toaster() {
  const [current, setCurrent] = React.useState<Toast | null>(null);
  React.useEffect(() => {
    listeners.add(setCurrent);
    return () => {
      listeners.delete(setCurrent);
    };
  }, []);
  if (!current) return null;
  return (
    <div
      className={cn(
        "fixed bottom-6 left-1/2 z-[100] -translate-x-1/2 rounded-lg border border-border bg-card px-4 py-2 text-sm shadow-lg",
        current.variant === "error" && "border-destructive/40 text-destructive"
      )}
      role="status"
    >
      {current.title}
    </div>
  );
}
