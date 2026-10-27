/**
 * POST /api/ai/chat
 * Body: { message: string }
 * Returns the Steward's reply (xAI if keyed, else the guided offline coach).
 * The Steward is given facts worked out by code, never raw guesses; it keeps
 * the newest messages for continuity.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { askSteward, hasXaiKey } from "@/lib/ai";
import { prisma } from "@/lib/db";
import { getStewardView } from "@/lib/steward";

const schema = z.object({
  message: z.string().min(1).max(2000),
});

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { message } = schema.parse(await req.json());

    // Everything the Steward knows is worked out by code (lib/steward.ts)
    const [view, recentMessages] = await Promise.all([
      getStewardView(user),
      // The NEWEST 20 messages (then put back in reading order)
      prisma.aiMessage.findMany({
        where: { userId: user.id },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 20,
      }),
    ]);
    const history = [...recentMessages].reverse().map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    const { reply, mode } = await askSteward({
      userMessage: message,
      history,
      context: view.context,
      offlineCtx: view.offline,
    });

    // Distinct timestamps: a pair stored in the same millisecond would have no
    // reliable reading order.
    const askedAt = new Date();
    await prisma.aiMessage.createMany({
      data: [
        { userId: user.id, role: "user", content: message, createdAt: askedAt },
        {
          userId: user.id,
          role: "assistant",
          content: reply,
          createdAt: new Date(askedAt.getTime() + 1),
        },
      ],
    });

    return NextResponse.json({
      ok: true,
      reply,
      mode,
      liveAi: hasXaiKey() && mode === "xai",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid request";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}

/** GET recent chat history for the Advisor tab */
export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  // The newest 40, shown oldest-first
  const newest = await prisma.aiMessage.findMany({
    where: { userId: user.id },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 40,
  });
  return NextResponse.json({
    ok: true,
    messages: newest.reverse(),
    liveAi: hasXaiKey(),
  });
}
