/**
 * Inbox helpers — accountability messages stored for the user.
 * Triggered after override spends and confirmed overspends;
 * later: monthly reviews, AI digests.
 */
import { prisma } from "./db";
import { overrideInboxDraft, overspendInboxDraft } from "@fintrack/domain";

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

/**
 * Accountability note for an expense the user confirmed even though it was
 * more than the bucket held. The expense itself is always saved as recorded.
 */
export async function createOverspendInboxMessage(opts: {
  userId: string;
  txId: string;
  bucketName: string;
  amountLabel: string;
  availableLabel: string;
  overByLabel: string;
  reason?: string | null;
}) {
  const draft = overspendInboxDraft({
    bucketName: opts.bucketName,
    amountLabel: opts.amountLabel,
    availableLabel: opts.availableLabel,
    overByLabel: opts.overByLabel,
    reason: opts.reason,
  });

  return prisma.inboxMessage.create({
    data: {
      userId: opts.userId,
      kind: "overspend",
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
