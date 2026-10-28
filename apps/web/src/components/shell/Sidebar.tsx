"use client";

import Link from "next/link";
import { LogOut, Plus, Sprout } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { ease } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { MAIN_NAV, MANAGE_NAV, isActive, type NavItem } from "./nav-items";

function Item({
  item,
  path,
  unread,
}: {
  item: NavItem;
  path: string;
  unread: number;
}) {
  const reduce = useReducedMotion();
  const on = isActive(path, item.href);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={on ? "page" : undefined}
      className={cn(
        "relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-[0.9375rem] font-medium transition-colors",
        on ? "text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      {on && (
        <motion.span
          layoutId="sidebar-pill"
          className="absolute inset-0 rounded-lg bg-primary/10"
          transition={reduce ? { duration: 0 } : ease.spring}
        />
      )}
      <Icon className="relative h-[18px] w-[18px]" aria-hidden />
      <span className="relative">{item.label}</span>
      {item.href === "/inbox" && unread > 0 && (
        <span className="badge relative ml-auto" aria-label={`${unread} unread`}>
          {unread}
        </span>
      )}
    </Link>
  );
}

export function Sidebar({
  path,
  email,
  unread,
  onLog,
  onLogout,
}: {
  path: string;
  email?: string;
  unread: number;
  /** Open the log sheet in place; without it the button goes to the Overview, which opens it */
  onLog?: () => void;
  onLogout: () => void;
}) {
  const logClass =
    "flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
  return (
    <aside className="hidden w-60 shrink-0 flex-col gap-5 border-r border-border bg-card/60 px-3 py-5 md:flex">
      <div className="flex items-center gap-2.5 px-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[image:var(--gradient-money)] text-primary-foreground shadow-[var(--glow-primary)]">
          <Sprout className="h-[18px] w-[18px]" aria-hidden />
        </span>
        <span className="font-display text-lg font-semibold tracking-tight">FinTrack</span>
      </div>

      {onLog ? (
        <button type="button" className={logClass} onClick={onLog} data-testid="log-sidebar">
          <Plus className="h-4 w-4" aria-hidden /> Log transaction
        </button>
      ) : (
        <Link href="/dashboard?log=1" className={logClass} data-testid="log-sidebar">
          <Plus className="h-4 w-4" aria-hidden /> Log transaction
        </Link>
      )}

      <nav aria-label="Primary" className="flex flex-1 flex-col gap-1 overflow-y-auto">
        {MAIN_NAV.map((n) => (
          <Item key={n.href} item={n} path={path} unread={unread} />
        ))}
        <div className="mt-4 px-3 pb-1 text-xs font-semibold uppercase tracking-wider text-subtle">
          Manage
        </div>
        {MANAGE_NAV.map((n) => (
          <Item key={n.href} item={n} path={path} unread={unread} />
        ))}
      </nav>

      <div className="flex items-center gap-2 border-t border-border px-2 pt-4">
        <span
          aria-hidden
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary"
        >
          {(email ?? "?").charAt(0).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground" title={email}>
          {email}
        </span>
        <button
          type="button"
          onClick={onLogout}
          aria-label="Log out"
          title="Log out"
          className="rounded-md p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
        >
          <LogOut className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </aside>
  );
}
