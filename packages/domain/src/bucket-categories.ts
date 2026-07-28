/**
 * Category → bucket rules (from FinTrack prototype).
 * Cross-bucket spend is allowed only with a written note/reason.
 */

/** Canonical display / sort order for standard buckets */
export const BUCKET_ORDER = [
  "tithe",
  "emergency",
  "invest",
  "give",
  "save",
  "spend",
] as const;

export type CanonicalBucketId = (typeof BUCKET_ORDER)[number];

export type ExpenseCategory = {
  id: string;
  label: string;
};

/** Full expense category list for the log modal */
export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  { id: "food", label: "Food & Dining" },
  { id: "transport", label: "Transport" },
  { id: "bills", label: "Recurring bills (electricity, water, rent)" },
  { id: "subscriptions", label: "Subscriptions (Netflix, DSTV etc.)" },
  { id: "household", label: "Household supplies" },
  { id: "outings", label: "Going out / Entertainment" },
  { id: "shopping", label: "Personal shopping" },
  { id: "clothing", label: "Clothing & Footwear" },
  { id: "health", label: "Health & Personal care" },
  { id: "data", label: "Data / Airtime" },
  { id: "personal", label: "Personal items" },
  { id: "debt_payment", label: "Debt repayment" },
  { id: "project", label: "Project expense" },
  { id: "church", label: "Church offering" },
  { id: "helping_others", label: "Helping others" },
  { id: "family_support", label: "Family support" },
  { id: "charity", label: "Charity / Donation" },
  { id: "business", label: "Business expense" },
  { id: "investment_deposit", label: "Investment deposit" },
  { id: "asset_purchase", label: "Asset / Capital purchase" },
  { id: "real_estate", label: "Real estate" },
  { id: "gold", label: "Gold / Precious metals" },
  { id: "safe_haven", label: "Safe haven asset" },
  { id: "tithe_payment", label: "Tithe payment" },
  { id: "other", label: "Other" },
];

/** Categories normally allowed per bucket */
export const BUCKET_ALLOWED_CATEGORIES: Record<string, string[]> = {
  spend: [
    "food",
    "transport",
    "outings",
    "shopping",
    "health",
    "data",
    "clothing",
    "personal",
    "other",
  ],
  save: [
    "bills",
    "subscriptions",
    "debt_payment",
    "household",
    "project",
    "other_save",
    "other",
  ],
  give: [
    "church",
    "helping_others",
    "family_support",
    "charity",
    "other_give",
    "other",
  ],
  invest: [
    "business",
    "investment_deposit",
    "asset_purchase",
    "other_invest",
    "other",
  ],
  emergency: ["real_estate", "gold", "safe_haven"],
  tithe: ["tithe_payment"],
};

export const BUCKET_DESCRIPTIONS: Record<string, string> = {
  spend: "Personal daily expenses and shopping for yourself",
  save: "Recurring bills, debts, projects, subscriptions, household supplies",
  give: "Church offering, helping others, family support",
  invest: "Business expenses and investments that generate income",
  emergency: "Long-term safe haven assets only (real estate, gold, etc.)",
  tithe: "Tithe payments only",
};

export function isCrossBucket(bucketId: string, categoryId: string | null | undefined): boolean {
  if (!bucketId || !categoryId) return false;
  const allowed = BUCKET_ALLOWED_CATEGORIES[bucketId];
  if (!allowed) return false; // unknown custom bucket: no rule
  return !allowed.includes(categoryId);
}

/** Sort buckets Tithe → Emergency → Invest → Give → Save → Spend, then others by order */
export function sortBucketsByCanonicalOrder<T extends { id: string; order?: number }>(
  buckets: T[]
): T[] {
  const rank = (id: string) => {
    const i = (BUCKET_ORDER as readonly string[]).indexOf(id);
    return i === -1 ? 1000 : i;
  };
  return [...buckets].sort((a, b) => {
    const ra = rank(a.id);
    const rb = rank(b.id);
    if (ra !== rb) return ra - rb;
    return (a.order ?? 0) - (b.order ?? 0);
  });
}

export function categoryLabel(id: string | null | undefined): string {
  if (!id) return "Expense";
  return EXPENSE_CATEGORIES.find((c) => c.id === id)?.label || id;
}
