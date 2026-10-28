"use client";

/**
 * App chrome. Desktop: a left sidebar and a slim top bar. Phone: a greeting
 * bar on top and a tab bar with a raised + at the bottom.
 */
import { usePathname, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { PageShell } from "@/components/motion/PageShell";
import { LogSheetProvider } from "./log/LogSheetProvider";

// Loaded the first time it is opened, so it costs nothing until then
const CommandPalette = dynamic(() => import("./CommandPalette").then((m) => m.CommandPalette), { ssr: false });
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
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteUsed, setPaletteUsed] = useState(false);
  const [mac, setMac] = useState(false);
  useEffect(() => setMac(/Mac|iPhone|iPad/.test(navigator.platform)), []);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteUsed(true);
        setPaletteOpen((o) => !o);
      } else if (e.key === "/" && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setPaletteUsed(true);
        setPaletteOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
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
            <button
              type="button"
              aria-label="Search pages and actions"
              onClick={() => {
                setPaletteUsed(true);
                setPaletteOpen(true);
              }}
              className="flex h-9 items-center gap-2 rounded-lg border border-border bg-muted px-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring md:px-3"
            >
              <Search className="h-4 w-4" aria-hidden />
              <span className="hidden md:inline">Search</span>
              <kbd className="hidden rounded border border-border px-1.5 text-xs md:inline">{mac ? "⌘K" : "Ctrl K"}</kbd>
            </button>
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
        {paletteUsed && <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />}
      </div>
    </div>
    </LogSheetProvider>
  );
}
