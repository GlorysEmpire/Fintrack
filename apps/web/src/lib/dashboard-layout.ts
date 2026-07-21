/**
 * Load / save per-user dashboard layout (which Overview sections to show).
 */
import {
  DEFAULT_DASHBOARD_LAYOUT,
  normalizeDashboardLayout,
  type DashboardLayout,
} from "@fintrack/domain";
import { prisma } from "./db";

export function parseDashboardLayout(json: string | null | undefined): DashboardLayout {
  if (!json || !json.trim()) {
    return normalizeDashboardLayout(DEFAULT_DASHBOARD_LAYOUT);
  }
  try {
    return normalizeDashboardLayout(JSON.parse(json));
  } catch {
    return normalizeDashboardLayout(DEFAULT_DASHBOARD_LAYOUT);
  }
}

export async function getUserDashboardLayout(
  userId: string
): Promise<DashboardLayout> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { dashboardLayoutJson: true },
  });
  return parseDashboardLayout(user?.dashboardLayoutJson);
}

export async function saveUserDashboardLayout(
  userId: string,
  layout: DashboardLayout
): Promise<DashboardLayout> {
  const normalized = normalizeDashboardLayout(layout);
  await prisma.user.update({
    where: { id: userId },
    data: { dashboardLayoutJson: JSON.stringify(normalized) },
  });
  return normalized;
}
