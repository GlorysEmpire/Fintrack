"use client";

/**
 * Liquid-finance chrome: 72px icon rail + glass top bar + aurora stage.
 * UI only — same props / navigation targets as before.
 */
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowLeftRight,
  Bell,
  Inbox,
  LayoutDashboard,
  LogOut,
  PieChart,
  Search,
  Settings,
  Sparkles,
  Target,
  Wallet,
} from "lucide-react";
import { formatLongDate } from "@/lib/format-date";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AuroraLayer } from "@/components/AuroraBackground";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/income", label: "Income", icon: Wallet },
  { href: "/expenses", label: "Transactions", icon: ArrowLeftRight },
  { href: "/budgets", label: "Budgets", icon: PieChart },
  { href: "/goals", label: "Goals", icon: Target },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/advisor", label: "Advisor", icon: Sparkles },
  { href: "/inbox", label: "Inbox", icon: Inbox },
] as const;

function initials(email?: string) {
  if (!email) return "FT";
  const local = email.split("@")[0] || "FT";
  return local.slice(0, 2).toUpperCase();
}

export function AppShell({
  children,
  baseCurrency,
  email,
  inboxUnread = 0,
}: {
  children: React.ReactNode;
  baseCurrency: string;
  email?: string;
  inboxUnread?: number;
}) {
  const path = usePathname();
  const router = useRouter();
  const reduce = useReducedMotion();
  const [ccy, setCcy] = useState(baseCurrency);
  const [dateLabel, setDateLabel] = useState("");

  useEffect(() => {
    setDateLabel(formatLongDate(new Date()));
  }, []);

  async function onCurrencyChange(value: string) {
    setCcy(value);
    try {
      await fetch("/api/settings/currency", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseCurrency: value }),
      });
      router.refresh();
    } catch {
      setCcy(baseCurrency);
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      <AuroraLayer />
      <div className="app-shell">
        <aside className="app-sidebar" aria-label="Primary">
          <Link href="/dashboard" className="app-sidebar-logo" aria-label="FinTrack home">
            <span className="app-sidebar-logo-mark" aria-hidden>
              F
            </span>
            <span className="app-sidebar-logo-text">FinTrack</span>
          </Link>

          <nav className="app-sidebar-nav">
            {TABS.map((t) => {
              const on =
                path === t.href ||
                (t.href !== "/dashboard" && path.startsWith(t.href));
              const Icon = t.icon;
              return (
                <Link
                  key={t.href}
                  href={t.href}
                  className={cn("app-nav-item", on && "app-nav-item-active")}
                  aria-label={t.label}
                  aria-current={on ? "page" : undefined}
                  title={t.label}
                >
                  {on && !reduce && (
                    <motion.span
                      layoutId="sidebar-active-pill"
                      className="app-nav-pill"
                      transition={{ type: "spring", stiffness: 400, damping: 32 }}
                    />
                  )}
                  {on && reduce && <span className="app-nav-pill" />}
                  <Icon className="h-5 w-5 relative z-[1]" aria-hidden />
                  {t.href === "/inbox" && inboxUnread > 0 && (
                    <span
                      className="absolute -right-0.5 -top-0.5 z-[2] flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground"
                      aria-label={`${inboxUnread} unread`}
                    >
                      {inboxUnread > 9 ? "9+" : inboxUnread}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          <div className="app-sidebar-footer">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-10 w-10 text-muted-foreground"
              onClick={logout}
              aria-label="Log out"
              title={email || "Log out"}
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </aside>

        <div className="app-main-column">
          <header className="app-topbar">
            <div className="app-topbar-left">
              <div className="app-topbar-title">Finance dashboard</div>
              <div className="app-topbar-sub" id="tb-date">
                {dateLabel}
              </div>
            </div>

            <div
              className="app-search"
              role="search"
              aria-label="Search (coming soon)"
            >
              <Search className="h-4 w-4 shrink-0" aria-hidden />
              <span className="truncate">Search for anything…</span>
              <kbd aria-hidden>⌘K</kbd>
            </div>

            <div className="app-topbar-right">
              <label className="sr-only" htmlFor="tb-ccy">
                Base currency
              </label>
              <select
                id="tb-ccy"
                value={ccy}
                onChange={(e) => onCurrencyChange(e.target.value)}
                className="h-9 rounded-full border border-border bg-surface-1/60 px-3 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="NGN">₦ NGN</option>
                <option value="USD">$ USD</option>
                <option value="GBP">£ GBP</option>
                <option value="EUR">€ EUR</option>
              </select>

              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="relative h-9 w-9 text-muted-foreground"
                aria-label={
                  inboxUnread > 0
                    ? `Notifications, ${inboxUnread} unread`
                    : "Notifications"
                }
                onClick={() => router.push("/inbox")}
              >
                <Bell className="h-4 w-4" />
                {inboxUnread > 0 && (
                  <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary" />
                )}
              </Button>

              <ThemeToggle />

              <div
                className="app-avatar"
                title={email}
                aria-label={email ? `Signed in as ${email}` : "Account"}
              >
                {initials(email)}
              </div>
            </div>
          </header>

          <main className="shell-main">{children}</main>
        </div>
      </div>
    </>
  );
}
