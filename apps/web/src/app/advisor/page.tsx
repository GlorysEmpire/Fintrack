/**
 * AI Advisor tab — FinTrack Steward (philosophy-bound, not generic chat).
 */
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { hasXaiKey } from "@/lib/ai";
import { unreadCount } from "@/lib/inbox";
import { prisma } from "@/lib/db";
import { getStewardView } from "@/lib/steward";
import { AdvisorClient } from "@/components/AdvisorClient";

export default async function AdvisorPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.onboarding === "pending") redirect("/onboarding");

  const [messages, inboxUnread, steward] = await Promise.all([
    prisma.aiMessage.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
      take: 40,
    }),
    unreadCount(user.id),
    getStewardView(user),
  ]);

  return (
    <AdvisorClient
      baseCurrency={user.baseCurrency}
      email={user.email}
      name={user.name}
      inboxUnread={inboxUnread}
      liveAi={hasXaiKey()}
      notes={steward.insights.slice(0, 4).map((i) => ({
        id: i.id,
        severity: i.severity,
        title: i.title,
        detail: i.detail,
        evidence: i.evidence,
        next: i.next,
      }))}
      initialMessages={messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
      }))}
    />
  );
}
