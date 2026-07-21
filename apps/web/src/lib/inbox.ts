/**
 * Inbox helpers — accountability messages stored for the user.
 * Triggered after override spends; later: monthly reviews, AI digests.
 */
import { prisma } from "./db";
import { overrideInboxDraft } from "@fintrack/domain";

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
