/**
 * GET/POST /api/public/cron/recurring
 * Records the transactions that recurring rules are due to create.
 * Vercel Cron: daily 03:00 UTC (apps/web/vercel.json).
 *
 * Guarded by Authorization: Bearer ${CRON_SECRET} (or x-cron-secret). With no
 * secret configured the endpoint refuses every request. All the work, and the
 * rules about it, are in lib/recurring.ts.
 */
import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cron-auth";
import { runDueRecurring } from "@/lib/recurring";

async function run(req: Request) {
  if (!cronAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const at = new Date();
  try {
    const summary = await runDueRecurring(at);
    // Counts only: never amounts, notes or user ids
    console.log("[recurring] run finished", {
      rules: summary.rulesChecked,
      created: summary.created,
      skipped: summary.skipped,
      alreadyDone: summary.alreadyDone,
      failedRules: summary.failedRules,
      moreToDo: summary.moreToDo,
    });
    return NextResponse.json({
      ok: summary.failedRules === 0,
      at: at.toISOString(),
      rulesChecked: summary.rulesChecked,
      created: summary.created,
      skipped: summary.skipped,
      alreadyDone: summary.alreadyDone,
      failedRules: summary.failedRules,
      moreToDo: summary.moreToDo,
    });
  } catch (e) {
    console.error(`[recurring] run failed: ${e instanceof Error ? e.name : "Error"}`);
    return NextResponse.json({ ok: false, error: "Run failed" }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return run(req);
}

export async function POST(req: Request) {
  return run(req);
}
