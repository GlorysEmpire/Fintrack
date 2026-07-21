/**
 * Fixed palette matching the screenshot / legacy app.
 * Falls back by index for custom plans.
 */
export const BUCKET_COLORS = [
  "#9b7fe8", // purple — tithe
  "#4a9eff", // blue — emergency
  "#22c98a", // green — invest
  "#e8609a", // pink — give
  "#7ed4b0", // mint — save
  "#f5c842", // yellow — spend
  "#e8405a",
  "#888",
];

const BY_ID: Record<string, string> = {
  tithe: "#9b7fe8",
  emergency: "#4a9eff",
  invest: "#22c98a",
  give: "#e8609a",
  save: "#7ed4b0",
  spend: "#f5c842",
  needs: "#4a9eff",
  wants: "#e8609a",
  savings: "#22c98a",
};

export function bucketColor(id: string, index = 0): string {
  return BY_ID[id] || BUCKET_COLORS[index % BUCKET_COLORS.length];
}
