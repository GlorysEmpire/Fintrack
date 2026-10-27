/**
 * Plan settings — under AppShell like the screenshot nav item.
 *
 * The plan (and the editor that changes it), plus the deliberate
 * Reset FinTrack action.
 */
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getBucketUsage, getUserPlan } from "@/lib/plan";
import { getResetPreview } from "@/lib/reset";
import { unreadCount } from "@/lib/inbox";
import { prisma } from "@/lib/db";
import { listRules } from "@/lib/recurring-rules";
import { AppShell } from "@/components/AppShell";
import { PlanSettings } from "@/components/PlanSettings";
import { RecurringManager } from "@/components/RecurringManager";
import { ResetFinTrack } from "@/components/ResetFinTrack";

export default async function SettingsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.onboarding === "pending") redirect("/onboarding");

  const [plan, usage, resetPreview, inboxUnread, rules, sources] = await Promise.all([
    getUserPlan(user.id),
    getBucketUsage(user.id),
    getResetPreview(user.id),
    unreadCount(user.id),
    listRules(user.id),
    prisma.incomeSource.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return (
    <AppShell
      baseCurrency={user.baseCurrency}
      email={user.email}
      inboxUnread={inboxUnread}
    >
      <h1 style={{ fontSize: 20, marginBottom: 8 }}>Budget plan</h1>
      <p className="sub">
        This is your financial system: your buckets, in your order, with your
        rules. Everyone&apos;s plan can be different.
      </p>

      <div className="card">
        <h2>Account</h2>
        <p style={{ marginTop: 6 }}>{user.email}</p>
        <p className="muted" style={{ marginTop: 4 }}>
          {user.passwordHash
            ? "Sign-in: email + password (email codes still work as backup)."
            : "Sign-in: email code only. Set a password for faster logins."}
        </p>
        <p style={{ marginTop: 12 }}>
          <a href="/set-password" className="btn btn-ghost" style={{ display: "inline-block" }}>
            {user.passwordHash ? "Change password" : "Set password"}
          </a>
        </p>
      </div>

      <PlanSettings
        plan={plan}
        baseCurrency={user.baseCurrency}
        usage={usage}
        hasHistory={resetPreview.transactions > 0}
      />

      <RecurringManager
        rules={rules.map((r) => ({
          id: r.id,
          type: r.type === "i" ? "i" : "e",
          amount: r.amount,
          currency: r.currency,
          bucketId: r.bucketId,
          sourceId: r.sourceId,
          note: r.note,
          cadence: r.cadence,
          dayOfMonth: r.dayOfMonth,
          active: r.active,
          nextDate: r.nextDate,
          lastError: r.lastError,
        }))}
        buckets={(plan?.buckets ?? [])
          .filter((b) => !b.archived)
          .map((b) => ({ id: b.id, name: b.name, emoji: b.emoji }))}
        sources={sources.map((s) => ({ id: s.id, name: s.name, emoji: s.emoji }))}
        baseCurrency={user.baseCurrency}
      />

      <div className="sec">Your data</div>
      <div className="card">
        <p>Download everything FinTrack holds about your money. It is yours.</p>
        <p style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <a href="/api/export" className="btn btn-ghost" style={{ display: "inline-block" }}>
            Everything (JSON)
          </a>
          <a href="/api/export?type=transactions" className="btn btn-ghost" style={{ display: "inline-block" }}>
            Transactions (CSV)
          </a>
          <a href="/api/export?type=transfers" className="btn btn-ghost" style={{ display: "inline-block" }}>
            Transfers (CSV)
          </a>
          <a href="/api/export?type=accounts" className="btn btn-ghost" style={{ display: "inline-block" }}>
            Accounts (CSV)
          </a>
        </p>
        <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
          Your password and sign-in details are never included.
        </p>
      </div>

      <div className="sec">Danger zone</div>
      <ResetFinTrack counts={resetPreview} email={user.email} />
    </AppShell>
  );
}
