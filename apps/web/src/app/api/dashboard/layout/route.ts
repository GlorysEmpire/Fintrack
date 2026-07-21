/**
 * GET  /api/dashboard/layout — current layout + section catalog
 * PUT  /api/dashboard/layout — save { order?, hidden? } or { toggleId, visible }
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  DASHBOARD_SECTIONS,
  normalizeDashboardLayout,
  toggleSection,
  type DashboardSectionId,
} from "@fintrack/domain";
import { getSessionUser } from "@/lib/auth";
import {
  getUserDashboardLayout,
  saveUserDashboardLayout,
} from "@/lib/dashboard-layout";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const layout = await getUserDashboardLayout(user.id);
  return NextResponse.json({
    ok: true,
    layout,
    catalog: DASHBOARD_SECTIONS,
  });
}

// More specific shape first — z.union tries schemas in order
const putSchema = z.union([
  z.object({
    toggleId: z.string(),
    visible: z.boolean(),
  }),
  z.object({
    order: z.array(z.string()).optional(),
    hidden: z.array(z.string()).optional(),
  }),
]);

export async function PUT(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const raw = await req.json();
    const body = putSchema.parse(raw);
    let layout = await getUserDashboardLayout(user.id);

    // Toggle a single optional section on/off
    if ("toggleId" in body && typeof body.visible === "boolean") {
      layout = toggleSection(
        layout,
        body.toggleId as DashboardSectionId,
        body.visible
      );
    } else {
      // Full replace of order / hidden lists
      layout = normalizeDashboardLayout({
        order: "order" in body ? body.order ?? layout.order : layout.order,
        hidden: "hidden" in body ? body.hidden ?? layout.hidden : layout.hidden,
      });
    }

    const saved = await saveUserDashboardLayout(user.id, layout);
    return NextResponse.json({ ok: true, layout: saved });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid request";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
