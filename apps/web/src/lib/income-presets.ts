/**
 * Generic income-source presets (client + server safe).
 * Opt-in only — never auto-seeded on GET / login.
 */

export const GENERIC_INCOME_PRESETS = [
  {
    id: "salary",
    name: "Salary (main)",
    type: "main",
    emoji: "💼",
    currency: "NGN",
    amount: 0,
  },
  {
    id: "business",
    name: "Business",
    type: "business",
    emoji: "🏢",
    currency: "NGN",
    amount: 0,
  },
  {
    id: "freelance",
    name: "Freelance",
    type: "business",
    emoji: "🛠️",
    currency: "NGN",
    amount: 0,
  },
  {
    id: "investment",
    name: "Investment",
    type: "investment",
    emoji: "📈",
    currency: "NGN",
    amount: 0,
  },
  {
    id: "gift",
    name: "Gift",
    type: "gift",
    emoji: "🎁",
    currency: "NGN",
    amount: 0,
  },
  {
    id: "other",
    name: "Other",
    type: "other",
    emoji: "💵",
    currency: "NGN",
    amount: 0,
  },
] as const;

export type GenericPresetId = (typeof GENERIC_INCOME_PRESETS)[number]["id"];

export type IncomeSourceInput = {
  name: string;
  type: string;
  emoji: string;
  currency: string;
  amount: number;
};

/** Resolve preset ids + optional custom rows into create payloads (no DB write). */
export function resolveIncomeSourceInputs(opts: {
  presetIds?: string[];
  custom?: IncomeSourceInput[];
}): IncomeSourceInput[] {
  const out: IncomeSourceInput[] = [];
  const seen = new Set<string>();

  for (const id of opts.presetIds ?? []) {
    const p = GENERIC_INCOME_PRESETS.find((x) => x.id === id);
    if (!p || seen.has(p.name.toLowerCase())) continue;
    seen.add(p.name.toLowerCase());
    out.push({
      name: p.name,
      type: p.type,
      emoji: p.emoji,
      currency: p.currency,
      amount: p.amount,
    });
  }

  for (const c of opts.custom ?? []) {
    const name = c.name.trim();
    if (!name) continue;
    if (seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    out.push({
      name,
      type: c.type?.trim() || "other",
      emoji: c.emoji?.trim() || "💵",
      currency: c.currency || "NGN",
      amount: typeof c.amount === "number" && c.amount >= 0 ? c.amount : 0,
    });
  }

  return out;
}
