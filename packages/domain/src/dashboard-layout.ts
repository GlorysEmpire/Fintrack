/**
 * Dashboard layout — which Overview sections the user wants to see.
 *
 * PINNED (always on until we get more user feedback):
 *   - charts
 *   - bucket_balances
 *
 * OPTIONAL (add / remove freely):
 *   - metrics
 *   - bucket_detail
 *   - recent_transactions
 *   - plan_status (banner when plan skipped / missing)
 */

export type DashboardSectionId =
  | "metrics"
  | "charts"
  | "bucket_balances"
  | "bucket_detail"
  | "recent_transactions"
  | "plan_status";

export interface DashboardSectionDef {
  id: DashboardSectionId;
  label: string;
  description: string;
  /** Cannot be removed from the dashboard */
  pinned: boolean;
}

/** Catalog of every section the product knows about */
export const DASHBOARD_SECTIONS: DashboardSectionDef[] = [
  {
    id: "metrics",
    label: "Summary cards",
    description: "Income, expenses, net remaining, days left",
    pinned: false,
  },
  {
    id: "charts",
    label: "Charts",
    description: "Income allocation donut + monthly cash flow",
    pinned: true,
  },
  {
    id: "bucket_balances",
    label: "Bucket balances",
    description: "Allocated vs remaining for each bucket",
    pinned: true,
  },
  {
    id: "bucket_detail",
    label: "Bucket spending detail",
    description: "Per-bucket spent vs allocated cards",
    pinned: false,
  },
  {
    id: "recent_transactions",
    label: "Recent transactions",
    description: "Latest money in and out this month",
    pinned: false,
  },
  {
    id: "plan_status",
    label: "Plan status banner",
    description: "Reminder when no plan is set yet",
    pinned: false,
  },
];

export const PINNED_SECTION_IDS: DashboardSectionId[] = DASHBOARD_SECTIONS.filter(
  (s) => s.pinned
).map((s) => s.id);

export const OPTIONAL_SECTION_IDS: DashboardSectionId[] = DASHBOARD_SECTIONS.filter(
  (s) => !s.pinned
).map((s) => s.id);

/**
 * Layout stored per user.
 * `order` = display order (pinned + visible optional).
 * `hidden` = optional section ids the user turned off.
 */
export interface DashboardLayout {
  order: DashboardSectionId[];
  hidden: DashboardSectionId[];
}

/** Default: everything visible in a sensible order (matches current product) */
export const DEFAULT_DASHBOARD_LAYOUT: DashboardLayout = {
  order: [
    "plan_status",
    "metrics",
    "charts",
    "bucket_balances",
    "bucket_detail",
    "recent_transactions",
  ],
  hidden: [],
};

/** Merge stored JSON with defaults; force pinned sections always visible */
export function normalizeDashboardLayout(
  raw: unknown
): DashboardLayout {
  const base: DashboardLayout = {
    order: [...DEFAULT_DASHBOARD_LAYOUT.order],
    hidden: [],
  };

  if (!raw || typeof raw !== "object") return base;

  const obj = raw as Partial<DashboardLayout>;
  const allIds = new Set(DASHBOARD_SECTIONS.map((s) => s.id));

  if (Array.isArray(obj.order)) {
    const cleaned = obj.order.filter(
      (id): id is DashboardSectionId =>
        typeof id === "string" && allIds.has(id as DashboardSectionId)
    );
    // Append any missing section ids at the end
    for (const s of DASHBOARD_SECTIONS) {
      if (!cleaned.includes(s.id)) cleaned.push(s.id);
    }
    base.order = cleaned;
  }

  if (Array.isArray(obj.hidden)) {
    base.hidden = obj.hidden.filter(
      (id): id is DashboardSectionId =>
        typeof id === "string" &&
        allIds.has(id as DashboardSectionId) &&
        !PINNED_SECTION_IDS.includes(id as DashboardSectionId)
    );
  }

  // Pinned can never stay hidden
  base.hidden = base.hidden.filter((id) => !PINNED_SECTION_IDS.includes(id));

  return base;
}

/** Sections to actually render, in order */
export function visibleSections(
  layout: DashboardLayout
): DashboardSectionId[] {
  const hidden = new Set(layout.hidden);
  return layout.order.filter((id) => {
    if (PINNED_SECTION_IDS.includes(id)) return true;
    return !hidden.has(id);
  });
}

export function isSectionVisible(
  layout: DashboardLayout,
  id: DashboardSectionId
): boolean {
  if (PINNED_SECTION_IDS.includes(id)) return true;
  return !layout.hidden.includes(id);
}

/** Toggle an optional section on/off */
export function toggleSection(
  layout: DashboardLayout,
  id: DashboardSectionId,
  visible: boolean
): DashboardLayout {
  if (PINNED_SECTION_IDS.includes(id)) return layout;
  const hidden = new Set(layout.hidden);
  if (visible) hidden.delete(id);
  else hidden.add(id);
  return {
    order: [...layout.order],
    hidden: [...hidden],
  };
}
