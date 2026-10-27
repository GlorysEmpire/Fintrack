/**
 * GET  /api/bank/connections — the user's read-only bank connections, and which providers can be connected
 * POST /api/bank/connections — connect one (records consent only; nothing is created)
 */
import { NextResponse } from "next/server";
import { jsonError, routeError, unauthorized } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { createConnection, listConnections } from "@/lib/bank/connections";
import { availableProviders } from "@/lib/bank/registry";
import { createConnectionSchema } from "../shared";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  return NextResponse.json({
    ok: true,
    connections: await listConnections(user.id),
    providers: availableProviders(),
  });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  try {
    const { provider } = createConnectionSchema.parse(await req.json());
    const result = await createConnection(user.id, provider);
    if (result.status !== "ok") {
      return jsonError(400, result.status === "invalid" ? result.error : "Not found");
    }
    return NextResponse.json({ ok: true, connectionId: result.value.id });
  } catch (e) {
    return routeError(e, "POST /api/bank/connections");
  }
}
