/**
 * Income tab — glass sources + month totals (UI).
 */
import { redirect } from "next/navigation";
import {
  amountInBase,
  filterMonthTxs,
  type CurrencyCode,
  type MoneyTx,
} from "@fintrack/domain";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { unreadCount } from "@/lib/inbox";
import { ensureDefaultSources, parseFx } from "@/lib/money";
import { IncomeClient } from "@/components/IncomeClient";

export default async function IncomePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.onboarding === "pending") redirect("/onboarding");

  await ensureDefaultSources(user.id);
  const fx = parseFx(user.fxRates);
  const base = user.baseCurrency as CurrencyCode;

  const [sources, txs, inboxUnread] = await Promise.all([
    prisma.incomeSource.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
    }),
    prisma.transaction.findMany({
      where: { userId: user.id, type: "i" },
      orderBy: { date: "desc" },
    }),
    unreadCount(user.id),
  ]);

  const money: MoneyTx[] = txs.map((t) => ({
    type: "i" as const,
    amount: t.amount,
    currency: t.currency,
    sourceId: t.sourceId,
    date: t.date,
  }));
  const month = filterMonthTxs(money);
  const total = month.reduce(
    (s, t) => s + amountInBase(t.amount, t.currency, user.baseCurrency, fx),
    0
  );

  return (
    <IncomeClient
      baseCurrency={user.baseCurrency}
      email={user.email}
      inboxUnread={inboxUnread}
      total={total}
      sources={sources.map((s) => ({
        id: s.id,
        name: s.name,
        emoji: s.emoji,
        currency: s.currency,
        logged: month
          .filter((t) => t.sourceId === s.id)
          .reduce(
            (sum, t) =>
              sum + amountInBase(t.amount, t.currency, user.baseCurrency, fx),
            0
          ),
      }))}
      recent={txs.slice(0, 12).map((t) => ({
        id: t.id,
        amount: t.amount,
        currency: t.currency,
        sourceId: t.sourceId,
        note: t.note,
        date: t.date.toISOString(),
      }))}
    />
  );
}
