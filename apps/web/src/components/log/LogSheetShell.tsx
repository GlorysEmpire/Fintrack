"use client";

import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { ease } from "@/lib/motion";
import { useIsPhone } from "./useIsPhone";

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * The frame of the log sheet: a bottom sheet on a phone, a centred dialog on
 * a bigger screen. Title and close stay put, the middle scrolls, and the
 * actions stay in reach at the bottom. Escape or a tap outside closes it, Tab
 * stays inside it, and focus goes back to where it was.
 */
export function LogSheetShell({
  title,
  badge,
  onClose,
  footer,
  children,
}: {
  title: string;
  badge?: React.ReactNode;
  onClose: () => void;
  footer: React.ReactNode;
  children: React.ReactNode;
}) {
  const reduce = useReducedMotion();
  const phone = useIsPhone();
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
      before?.focus?.();
    };
  }, []);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      onClose();
      return;
    }
    if (e.key !== "Tab" || !panel.current) return;
    const items = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  const from = reduce ? { opacity: 0 } : phone ? { y: "100%" } : { opacity: 0, y: 16 };

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center bg-black/70 backdrop-blur-sm md:items-center md:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={onKeyDown}
    >
      <motion.div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-border bg-[var(--surface-elevated)] shadow-[var(--shadow-glass)] outline-none md:max-h-[90dvh] md:max-w-[30rem] md:rounded-3xl"
        initial={from}
        animate={{ opacity: 1, y: 0 }}
        transition={reduce ? { duration: 0 } : ease.spring}
      >
        <div className="shrink-0 px-5 pt-3 md:pt-5">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border md:hidden" aria-hidden />
          <div className="flex items-center justify-between gap-3">
            <h2 id={titleId} className="font-display text-lg font-semibold">
              {title}
            </h2>
            <div className="flex items-center gap-2">
              {badge}
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4 pt-2">{children}</div>
        <div className="shrink-0 border-t border-border px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3">{footer}</div>
      </motion.div>
    </div>,
    document.body
  );
}
