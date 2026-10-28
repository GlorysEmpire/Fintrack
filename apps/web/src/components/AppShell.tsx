"use client";

/**
 * App chrome. Desktop: a left sidebar and a slim top bar. Phone: a greeting
 * bar on top and a tab bar with a raised + at the bottom.
 */
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PageShell } from "@/components/motion/PageShell";
import { LogSheetProvider } from "./log/LogSheetProvider";
import { formatLongDate } from "@/lib/format-date";
import { ThemeToggle } from "@/components/ThemeToggle";
import { MobileTabBar } from "./shell/MobileTabBar";
import { Sidebar } from "./shell/Sidebar";
import { UserMenu } from "./shell/UserMenu";
import { displayName, pageTitle } from "./shell/nav-items";

function greeting(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
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
  const [ccy, setCcy] = useState(baseCurrency);
  const [dateLabel, setDateLabel] = useState("");
  const [hello, setHello] = useState("");
  useEffect(() => {
    const now = new Date();
    setDateLabel(formatLongDate(now));
    setHello(greeting(now.getHours()));
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

  const name = displayName(email);

  return (
    <LogSheetProvider>
    <div className="app-shell">
      <Sidebar path={path} email={email} unread={inboxUnread} onLogout={logout} />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-card/60 px-4 py-3 backdrop-blur-xl md:px-8">
          <div className="min-w-0">
            <div className="truncate font-display text-lg font-semibold leading-tight md:hidden">
              {hello && name ? `${hello}, ${name}` : "FinTrack"}
            </div>
            <div className="hidden font-display text-xl font-semibold leading-tight md:block">
              {pageTitle(path)}
            </div>
            <p id="tb-date" className="text-xs text-muted-foreground">
              {dateLabel}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <select
              id="tb-ccy"
              aria-label="Base currency"
              value={ccy}
              onChange={(e) => onCurrencyChange(e.target.value)}
              className="h-9 cursor-pointer rounded-lg border border-border bg-muted px-2 text-sm text-foreground outline-none focus-visible:outline-2 focus-visible:outline-ring"
            >
              <option value="NGN">₦ NGN</option>
              <option value="USD">$ USD</option>
              <option value="GBP">£ GBP</option>
              <option value="EUR">€ EUR</option>
            </select>
            <ThemeToggle />
            <UserMenu email={email} unread={inboxUnread} onLogout={logout} />
          </div>
        </header>

        <div className="shell-main">
          <PageShell>{children}</PageShell>
        </div>

        <MobileTabBar path={path} />
      </div>
    </div>
    </LogSheetProvider>
  );
}
