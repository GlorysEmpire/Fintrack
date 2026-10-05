/**
 * Plan settings — under AppShell like the screenshot nav item.
 *
 * The plan, and the editor that changes it.
 */
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getBucketUsage, getUserPlan } from "@/lib/plan";
import { unreadCount } from "@/lib/inbox";
import { AppShell } from "@/components/AppShell";
import { PlanSettings } from "@/components/PlanSettings";

export default async function SettingsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.onboarding === "pending") redirect("/onboarding");

  const [plan, usage, transactionCount, inboxUnread] = await Promise.all([
    getUserPlan(user.id),
    getBucketUsage(user.id),
    prisma.transaction.count({ where: { userId: user.id } }),
    unreadCount(user.id),
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
        hasHistory={transactionCount > 0}
      />
    </AppShell>
  );
}
