/**
 * Accounts — where your money is held, and where debts sit.
 * Separate from the plan (what money is FOR) and from transactions (what happened).
 */
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { listAccounts } from "@/lib/accounts";
import { listTransfers } from "@/lib/transfers";
import { unreadCount } from "@/lib/inbox";
import { AppShell } from "@/components/AppShell";
import { AccountsManager } from "@/components/AccountsManager";

export default async function AccountsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.onboarding === "pending") redirect("/onboarding");

  const [{ accounts, unassignedCount }, transfers, inboxUnread] = await Promise.all([
    listAccounts(user.id),
    listTransfers(user.id, { limit: 30 }),
    unreadCount(user.id),
  ]);

  return (
    <AppShell
      baseCurrency={user.baseCurrency}
      email={user.email}
      inboxUnread={inboxUnread}
    >
      <h1 style={{ fontSize: 20, marginBottom: 8 }}>Accounts</h1>
      <p className="sub">
        Where your money is held, and where debts sit. An account answers
        &ldquo;where is the money?&rdquo;; your plan&apos;s buckets answer
        &ldquo;what is it for?&rdquo;. Moving money between your own accounts is
        a transfer: it is never income and never spending.
      </p>
      <AccountsManager
        accounts={accounts}
        transfers={transfers}
        unassignedCount={unassignedCount}
      />
    </AppShell>
  );
}
