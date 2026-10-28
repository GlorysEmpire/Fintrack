/**
 * Inbox helpers — accountability messages stored for the user.
 * Triggered after override spends; later: monthly reviews, AI digests.
 */
import { prisma } from "./db";
import { overrideInboxDraft, startOfMonth } from "@fintrack/domain";

export async function createOverrideInboxMessage(opts: {
  userId: string;
  txId: string;
  bucketName: string;
  amountLabel: string;
  reason: string;
  remainingLabel: string;
}) {
  const draft = overrideInboxDraft({
    bucketName: opts.bucketName,
    amountLabel: opts.amountLabel,
    reason: opts.reason,
    remainingLabel: opts.remainingLabel,
  });

  return prisma.inboxMessage.create({
    data: {
      userId: opts.userId,
      kind: "override_coach",
      title: draft.title,
      body: draft.body,
      relatedTxId: opts.txId,
    },
  });
}

export async function listInbox(userId: string, limit = 50) {
  return prisma.inboxMessage.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function markInboxRead(userId: string, id: string) {
  return prisma.inboxMessage.updateMany({
    where: { id, userId },
    data: { read: true },
  });
}

export async function unreadCount(userId: string) {
  return prisma.inboxMessage.count({
    where: { userId, read: false },
  });
}

/**
 * A note Steward writes on its own (a heads-up or a recap). It is written once: if one
 * with the same title already exists since `since`, nothing is added.
 */
export async function writeSteward(opts: {
  userId: string;
  kind: "plan_tip" | "monthly_review";
  title: string;
  body: string;
  since: Date;
  relatedTxId?: string;
}): Promise<boolean> {
  const exists = await prisma.inboxMessage.findFirst({
    where: { userId: opts.userId, kind: opts.kind, title: opts.title, createdAt: { gte: opts.since } },
    select: { id: true },
  });
  if (exists) return false;
  await prisma.inboxMessage.create({
    data: {
      userId: opts.userId,
      kind: opts.kind,
      title: opts.title,
      body: opts.body,
      relatedTxId: opts.relatedTxId ?? null,
    },
  });
  return true;
}

/** A heads-up lasts for the month it was written in: one per bucket per month */
export const headsUpSince = (now: Date = new Date()) => startOfMonth(now);
