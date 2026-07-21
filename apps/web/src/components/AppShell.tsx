"use client";

/**
 * Shell cloned from legacy FinTrack.html:
 *
 *   <div id="s-main" class="on">
 *     <div class="topbar">...</div>
 *     <div class="nav">...</div>
 *     <div class="pages"><div class="page on">...</div></div>
 *   </div>
 */
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { formatLongDate } from "@/lib/format-date";

const TABS = [
  { href: "/dashboard", label: "📊 Overview" },
  { href: "/income", label: "💵 Income" },
  { href: "/expenses", label: "💸 Expenses" },
  { href: "/settings", label: "⚙️ Plan settings" },
  { href: "/advisor", label: "🤖 AI Advisor" },
  { href: "/inbox", label: "📬 Inbox" },
];

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
  // Render date only after mount so server HTML never fights the client clock/TZ
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
      {/* topbar — identical markup to legacy index.html */}
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
          <button type="button" className="tb-ghost" onClick={logout} title={email}>
            Log out
          </button>
        </div>
      </div>

      {/* nav — same class names as legacy */}
      <div className="nav">
        {TABS.map((t) => {
          const on =
            path === t.href ||
            (t.href !== "/dashboard" && path.startsWith(t.href));
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`nav-btn${on ? " on" : ""}`}
            >
              {t.label}
              {t.href === "/inbox" && inboxUnread > 0 && (
                <span className="badge">{inboxUnread}</span>
              )}
            </Link>
          );
        })}
      </div>

      {/* page content scrolls here (legacy .page.on) */}
      <div className="shell-main">{children}</div>
    </div>
  );
}
