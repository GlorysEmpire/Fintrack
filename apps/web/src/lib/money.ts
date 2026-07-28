/**
 * Server-side helpers: FX rates, opening balances, income-source creates.
 *
 * Income sources are user-owned. NEVER auto-seed on GET / first login.
 * Presets: see income-presets.ts — only applied when the user opts in.
 */
import { prisma } from "./db";
import { DEFAULT_FX } from "@fintrack/domain";
import type { IncomeSourceInput } from "./income-presets";

export {
  GENERIC_INCOME_PRESETS,
  resolveIncomeSourceInputs,
  type GenericPresetId,
  type IncomeSourceInput,
} from "./income-presets";

/**
 * Explicit create only — called from onboarding / user actions.
 * Empty list is a no-op (valid: user has zero sources).
 */
export async function createIncomeSourcesForUser(
  userId: string,
  sources: IncomeSourceInput[]
) {
  if (sources.length === 0) return { created: 0 };
  await prisma.incomeSource.createMany({
    data: sources.map((s) => ({
      userId,
      name: s.name,
      type: s.type,
      emoji: s.emoji,
      currency: s.currency,
      amount: s.amount,
    })),
  });
  return { created: sources.length };
}

export function parseFx(fxRatesJson: string): Record<string, number> {
  try {
    const parsed = JSON.parse(fxRatesJson) as Record<string, number>;
    return { ...DEFAULT_FX, ...parsed };
  } catch {
    return { ...DEFAULT_FX };
  }
}

export function parseOpeningBalances(json: string): Record<string, number> {
  try {
    return JSON.parse(json) as Record<string, number>;
  } catch {
    return {};
  }
}
