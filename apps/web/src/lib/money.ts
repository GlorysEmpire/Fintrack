/**
 * Server-side helpers: load user FX rates, opening balances, default income sources.
 */
import { prisma } from "./db";
import { DEFAULT_FX } from "@fintrack/domain";

/** Default income sources (same spirit as the legacy FinTrack app) */
export const DEFAULT_INCOME_SOURCES = [
  { name: "Software Development", type: "main", emoji: "💻", currency: "NGN", amount: 0 },
  { name: "Trading", type: "business", emoji: "📈", currency: "NGN", amount: 0 },
  { name: "Teaching & Signals", type: "business", emoji: "📡", currency: "NGN", amount: 0 },
  { name: "Crypto", type: "investment", emoji: "₿", currency: "USD", amount: 0 },
  { name: "Real Estate", type: "investment", emoji: "🏠", currency: "NGN", amount: 0 },
  { name: "Gold", type: "investment", emoji: "🥇", currency: "USD", amount: 0 },
  { name: "Stocks", type: "investment", emoji: "📊", currency: "USD", amount: 0 },
  { name: "Gift", type: "gift", emoji: "🎁", currency: "NGN", amount: 0 },
];

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

/** Seed default sources once when user has none (first login / first open of log modal) */
export async function ensureDefaultSources(userId: string) {
  const count = await prisma.incomeSource.count({ where: { userId } });
  if (count > 0) return;
  await prisma.incomeSource.createMany({
    data: DEFAULT_INCOME_SOURCES.map((s) => ({ ...s, userId })),
  });
}
