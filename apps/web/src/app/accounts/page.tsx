/**
 * Accounts — where your money is held, and where debts sit.
 * Separate from the plan (what money is FOR) and from transactions (what happened).
 */
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { listAccounts } from "@/lib/accounts";
import { listTransfers } from "@/lib/transfers";
import { unreadCount } from "@/lib/inbox";
import { getUserPlan } from "@/lib/plan";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { AccountsManager } from "@/components/AccountsManager";

export default async function AccountsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.onboarding === "pending") redirect("/onboarding");

  const [{ accounts, unassignedCount }, transfers, inboxUnread, plan] = await Promise.all([
    listAccounts(user.id),
    listTransfers(user.id, { limit: 30 }),
    unreadCount(user.id),
    getUserPlan(user.id),
  ]);

  return (
    <AppShell
      baseCurrency={user.baseCurrency}
      email={user.email}
      name={user.name}
      inboxUnread={inboxUnread}
    >
      <PageHeader
        title="Accounts"
        infoLabel="About accounts"
        info="Where your money is held, and where debts sit. An account answers “where is the money?”; your plan's buckets answer “what is it for?”. Moving money between your own accounts is a transfer: it is never income and never spending."
      >
        <Link href="/imports" className="text-sm font-medium">
          Bank imports (read-only) →
        </Link>
      </PageHeader>
      <AccountsManager
        accounts={accounts}
        transfers={transfers}
        unassignedCount={unassignedCount}
        buckets={(plan?.buckets ?? [])
          .filter((b) => !b.archived)
          .map((b) => ({ id: b.id, name: b.name, emoji: b.emoji }))}
      />
    </AppShell>
  );
}
