"use client";

/**
 * App chrome: topbar + nav with Lucide icons + theme toggle.
 */
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeftRight,
  Inbox,
  LayoutDashboard,
  Settings,
  Sparkles,
  Wallet,
} from "lucide-react";
import { formatLongDate } from "@/lib/format-date";
import { ThemeToggle } from "@/components/ThemeToggle";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/income", label: "Income", icon: Wallet },
  { href: "/expenses", label: "Expenses", icon: ArrowLeftRight },
  { href: "/settings", label: "Plan", icon: Settings },
  { href: "/advisor", label: "Advisor", icon: Sparkles },
  { href: "/inbox", label: "Inbox", icon: Inbox },
] as const;

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
    <div className="app-shell">
      <div className="topbar">
        <div className="tb-left">
          <h1>Finance dashboard</h1>
          <p id="tb-date">{dateLabel}</p>
        </div>
        <div className="tb-right">
          Base currency
          <select
            id="tb-ccy"
            value={ccy}
            onChange={(e) => onCurrencyChange(e.target.value)}
          >
            <option value="NGN">₦ NGN</option>
            <option value="USD">$ USD</option>
            <option value="GBP">£ GBP</option>
            <option value="EUR">€ EUR</option>
          </select>
          <ThemeToggle />
          <button type="button" className="tb-ghost" onClick={logout} title={email}>
            Log out
          </button>
        </div>
      </div>

      <div className="nav">
        {TABS.map((t) => {
          const on =
            path === t.href ||
            (t.href !== "/dashboard" && path.startsWith(t.href));
          const Icon = t.icon;
          return (
            <div key={t.href} className="nav-btn-wrap">
              <Link
                href={t.href}
                className={cn("nav-btn", on && "on")}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden />
                {t.label}
                {t.href === "/inbox" && inboxUnread > 0 && (
                  <span className="badge">{inboxUnread}</span>
                )}
              </Link>
              {on && (
                <motion.span
                  layoutId="nav-underline"
                  className="nav-underline"
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
            </div>
          );
        })}
      </div>

      <div className="shell-main">{children}</div>
    </div>
  );
}
