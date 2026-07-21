/**
 * GET   /api/inbox — list messages (newest first)
 * PATCH /api/inbox — mark one or all read { id? } | { all: true }
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { listInbox, markInboxRead, unreadCount } from "@/lib/inbox";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const [messages, unread] = await Promise.all([
    listInbox(user.id),
    unreadCount(user.id),
  ]);
  return NextResponse.json({ ok: true, messages, unread });
}

const patchSchema = z.union([
  z.object({ id: z.string() }),
  z.object({ all: z.literal(true) }),
]);

export async function PATCH(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = patchSchema.parse(await req.json());
    if ("all" in body) {
      await prisma.inboxMessage.updateMany({
        where: { userId: user.id, read: false },
        data: { read: true },
      });
    } else {
      await markInboxRead(user.id, body.id);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid request";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
