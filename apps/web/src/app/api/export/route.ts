/**
 * GET /api/export                          everything, as JSON
 * GET /api/export?type=transactions        transactions as CSV  (also: transfers, accounts)
 *
 * The signed-in user's own data only. Never cached, always a download, and
 * limited to 10 a hour per user.
 */
import { NextResponse } from "next/server";
import { jsonError, routeError, unauthorized } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { buildExport, exportCsv, type ExportKind } from "@/lib/export";
import { exportUserLimiter, retryAfterSeconds } from "@/lib/rate-limit";

const KINDS: ExportKind[] = ["transactions", "transfers", "accounts"];

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  try {
    const limit = await exportUserLimiter.limit(user.id);
    if (!limit.success) {
      return jsonError(429, "Too many exports. Try again later.", {}, { "Retry-After": String(retryAfterSeconds(limit)) });
    }

    const type = new URL(req.url).searchParams.get("type");
    const stamp = new Date().toISOString().slice(0, 10);
    const headers = {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    };
    const bundle = await buildExport(user.id);

    if (type === null || type === "all") {
      return new NextResponse(JSON.stringify(bundle, null, 2), {
        headers: {
          ...headers,
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename="fintrack-export-${stamp}.json"`,
        },
      });
    }
    if (!KINDS.includes(type as ExportKind)) return jsonError(400, "Unknown export type.");
    return new NextResponse(exportCsv(bundle, type as ExportKind), {
      headers: {
        ...headers,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="fintrack-${type}-${stamp}.csv"`,
      },
    });
  } catch (e) {
    return routeError(e, "GET /api/export");
  }
}
