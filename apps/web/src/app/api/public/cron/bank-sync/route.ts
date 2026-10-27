/**
 * GET/POST /api/public/cron/bank-sync
 * Syncs every active bank connection that is due: READ-ONLY, it only fills the
 * review queue. Same authentication as the recurring job (CRON_SECRET, closed
 * when unset). NOT registered in vercel.json: nothing real is connectable yet.
 */
import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cron-auth";
import { syncAllDue } from "@/lib/bank/sync";

async function run(req: Request) {
  if (!cronAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const at = new Date();
  try {
    const results = await syncAllDue(at);
    const count = (outcome: string) => results.filter((r) => r.outcome === outcome).length;
    // Counts only: never user ids, descriptions or amounts
    const summary = {
      connections: results.length,
      synced: count("synced"),
      failed: count("failed"),
      skipped: count("skipped"),
      imported: results.reduce((n, r) => n + r.created, 0),
    };
    console.log("[bank-sync] run finished", summary);
    return NextResponse.json({ ok: summary.failed === 0, at: at.toISOString(), ...summary });
  } catch (e) {
    console.error(`[bank-sync] run failed: ${e instanceof Error ? e.name : "Error"}`);
    return NextResponse.json({ ok: false, error: "Run failed" }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return run(req);
}

export async function POST(req: Request) {
  return run(req);
}
