/**
 * Bank imports — read-only. A bank connection only ever fills a review queue;
 * nothing becomes part of your history until you accept or match it here.
 */
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { listConnections } from "@/lib/bank/connections";
import { availableProviders } from "@/lib/bank/registry";
import { listImports } from "@/lib/bank/review";
import { listAccounts } from "@/lib/accounts";
import { getUserPlan } from "@/lib/plan";
import { unreadCount } from "@/lib/inbox";
import { AppShell } from "@/components/AppShell";
import { ImportsManager } from "@/components/ImportsManager";

export default async function ImportsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.onboarding === "pending") redirect("/onboarding");

  const [connections, imports, { accounts }, plan, inboxUnread] = await Promise.all([
    listConnections(user.id),
    listImports(user.id),
    listAccounts(user.id),
    getUserPlan(user.id),
    unreadCount(user.id),
  ]);

  return (
    <AppShell baseCurrency={user.baseCurrency} email={user.email} inboxUnread={inboxUnread}>
      <h1 style={{ fontSize: 20, marginBottom: 8 }}>Bank imports</h1>
      <p className="sub">
        Read-only. FinTrack can look at a linked bank account&apos;s transactions
        and show them here for your review. It can never move money, and nothing
        is added to your history until you accept or match it.
      </p>
      <ImportsManager
        connections={connections}
        imports={imports}
        providers={availableProviders()}
        accounts={accounts
          .filter((a) => a.status === "active")
          .map((a) => ({ id: a.id, name: a.name, currency: a.currency }))}
        buckets={(plan?.buckets ?? [])
          .filter((b) => !b.archived)
          .map((b) => ({ id: b.id, name: b.name, emoji: b.emoji }))}
      />
    </AppShell>
  );
}
