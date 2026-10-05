/**
 * RESET FINTRACK — erase one user's financial data and return them to setup.
 *
 * What is the user's financial data? Every model that hangs off User was
 * checked (schema.prisma):
 *
 *   ERASED
 *     Transaction    what happened
 *     BudgetPlan     the plan. The derived state lives on this same row (the
 *                    cached opening balances and the "last month packed"
 *                    marker), so no stale cache can outlive the reset.
 *     IncomeSource   where income comes from (setup asks for these again)
 *     RecurringRule  would otherwise keep generating transactions into the
 *                    emptied account, against buckets that no longer exist
 *     InboxMessage   accountability notes about the erased transactions
 *     AiMessage      Steward conversations about the erased numbers
 *
 *   KEPT
 *     User           the account itself: email, password, name
 *     Session        the user stays signed in, on every device
 *     EmailOtp       login codes in flight
 *     User.baseCurrency / fxRates / theme / dashboardLayoutJson
 *                    preferences, not financial records
 *     Household, HouseholdMember
 *                    unused schema; nothing in the product writes them
 *
 *   CHANGED
 *     User.onboarding → "pending", which sends the user back through setup
 *
 * Everything happens in ONE database transaction: either all of it is done, or
 * (on any failure) nothing changed at all. Every statement is scoped to the
 * one user id.
 */
import { prisma } from "./db";

export type ResetCounts = {
  transactions: number;
  plans: number;
  incomeSources: number;
  recurringRules: number;
  inboxMessages: number;
  aiMessages: number;
};

/**
 * Prisma treats `where: { userId: undefined }` as "no filter at all", which on
 * a deleteMany would mean every user's rows. A missing id must stop here.
 */
function requireUserId(userId: unknown): string {
  if (typeof userId !== "string" || userId.trim() === "") {
    throw new Error("Reset FinTrack: a user id is required");
  }
  return userId;
}

/** What a reset would erase, for the confirmation dialog. Reads only. */
export async function getResetPreview(userIdInput: string): Promise<ResetCounts> {
  const userId = requireUserId(userIdInput);
  const [transactions, plans, incomeSources, recurringRules, inboxMessages, aiMessages] =
    await Promise.all([
      prisma.transaction.count({ where: { userId } }),
      prisma.budgetPlan.count({ where: { userId } }),
      prisma.incomeSource.count({ where: { userId } }),
      prisma.recurringRule.count({ where: { userId } }),
      prisma.inboxMessage.count({ where: { userId } }),
      prisma.aiMessage.count({ where: { userId } }),
    ]);
  return { transactions, plans, incomeSources, recurringRules, inboxMessages, aiMessages };
}

/**
 * Erase the user's financial data. The caller has already authenticated the
 * user and checked the typed confirmation.
 */
export async function resetFinancialData(userIdInput: string): Promise<ResetCounts> {
  const userId = requireUserId(userIdInput);

  const [transactions, recurringRules, incomeSources, inboxMessages, aiMessages, plans] =
    await prisma.$transaction([
      // Transactions first: they reference recurring rules
      prisma.transaction.deleteMany({ where: { userId } }),
      prisma.recurringRule.deleteMany({ where: { userId } }),
      prisma.incomeSource.deleteMany({ where: { userId } }),
      prisma.inboxMessage.deleteMany({ where: { userId } }),
      prisma.aiMessage.deleteMany({ where: { userId } }),
      prisma.budgetPlan.deleteMany({ where: { userId } }),
      // Last: if the account row is missing this throws and rolls everything back
      prisma.user.update({
        where: { id: userId },
        data: { onboarding: "pending" },
      }),
    ]);

  return {
    transactions: transactions.count,
    plans: plans.count,
    incomeSources: incomeSources.count,
    recurringRules: recurringRules.count,
    inboxMessages: inboxMessages.count,
    aiMessages: aiMessages.count,
  };
}
