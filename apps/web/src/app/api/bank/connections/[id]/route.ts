/**
 * POST   /api/bank/connections/[id] — { action: "accounts" | "link" | "sync" }
 * DELETE /api/bank/connections/[id] — disconnect: stops syncing at once, keeps what was imported
 */
import { NextResponse } from "next/server";
import { jsonError, routeError, unauthorized } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { disconnect, linkAccount, providerAccounts } from "@/lib/bank/connections";
import { syncConnection } from "@/lib/bank/sync";
import { prisma } from "@/lib/db";
import { connectionActionSchema } from "../../shared";

type Ctx = { params: Promise<{ id: string }> };
const MIN_MANUAL_SYNC_GAP_MS = 30_000;

export async function POST(req: Request, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  try {
    const { id } = await ctx.params;
    const body = connectionActionSchema.parse(await req.json());

    if (body.action === "accounts") {
      const result = await providerAccounts(user.id, id);
      if (result.status === "not_found") return jsonError(404, "Not found");
      if (result.status === "invalid") return jsonError(400, result.error);
      return NextResponse.json({ ok: true, accounts: result.value });
    }

    if (body.action === "link") {
      const result = await linkAccount(user.id, id, body);
      if (result.status === "not_found") return jsonError(404, "Not found");
      if (result.status === "invalid") return jsonError(400, result.error);
      return NextResponse.json({ ok: true });
    }

    // sync: only the user's own connection, and not more than once every 30 seconds
    const connection = await prisma.bankConnection.findFirst({ where: { id, userId: user.id } });
    if (!connection) return jsonError(404, "Not found");
    if (connection.status !== "active") return jsonError(400, `This connection is ${connection.status}.`);
    if (connection.lastSyncAt && Date.now() - connection.lastSyncAt.getTime() < MIN_MANUAL_SYNC_GAP_MS) {
      return jsonError(429, "It was synced a moment ago. Try again shortly.");
    }
    const result = await syncConnection(connection.id);
    if (result.outcome === "failed") {
      return jsonError(502, result.reason === "consent" ? "The bank no longer allows access. Reconnect to continue." : "The bank could not be reached. It will be retried.");
    }
    if (result.outcome === "skipped") return jsonError(400, result.reason ?? "Nothing to sync.");
    return NextResponse.json({ ok: true, imported: result.created, updated: result.updated, flagged: result.flagged });
  } catch (e) {
    return routeError(e, "POST /api/bank/connections/[id]");
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  try {
    const { id } = await ctx.params;
    const result = await disconnect(user.id, id);
    if (result.status === "not_found") return jsonError(404, "Not found");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return routeError(e, "DELETE /api/bank/connections/[id]");
  }
}
