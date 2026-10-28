"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { ease } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { MAIN_NAV, isActive } from "./nav-items";

/** Four tabs and a raised + for logging, with the home-indicator safe area below */
export function MobileTabBar({
  path,
  onLog,
}: {
  path: string;
  onLog?: () => void;
}) {
  const reduce = useReducedMotion();
  const spring = reduce ? { duration: 0 } : ease.spring;
  const tabs = MAIN_NAV.map((n) => {
    const on = isActive(path, n.href);
    const Icon = n.icon;
    return (
      <Link
        key={n.href}
        href={n.href}
        aria-current={on ? "page" : undefined}
        className={cn(
          "flex flex-col items-center justify-center gap-0.5 py-2 text-xs font-medium transition-colors",
          on ? "text-primary" : "text-muted-foreground"
        )}
      >
        <motion.span animate={{ scale: on ? 1.15 : 1 }} transition={spring} className="flex">
          <Icon className="h-5 w-5" aria-hidden />
        </motion.span>
        {n.short ?? n.label}
      </Link>
    );
  });

  const fabClass =
    "flex h-14 w-14 items-center justify-center rounded-full bg-[image:var(--gradient-money)] text-primary-foreground shadow-[var(--glow-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
  const fabIcon = (
    <motion.span whileTap={reduce ? undefined : { rotate: 45, scale: 0.94 }} transition={spring} className="flex">
      <Plus className="h-7 w-7" strokeWidth={2.5} aria-hidden />
    </motion.span>
  );

  return (
    <nav
      aria-label="Primary"
      className="z-40 grid shrink-0 grid-cols-6 items-end border-t border-border bg-[var(--surface-glass)] pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
    >
      {tabs.slice(0, 2)}
      <div className="flex justify-center">
        {onLog ? (
          <button type="button" className={cn(fabClass, "-mt-5")} onClick={onLog} aria-label="Log transaction" data-testid="fab">
            {fabIcon}
          </button>
        ) : (
          <Link href="/dashboard?log=1" className={cn(fabClass, "-mt-5")} aria-label="Log transaction" data-testid="fab">
            {fabIcon}
          </Link>
        )}
      </div>
      {tabs.slice(2)}
    </nav>
  );
}
