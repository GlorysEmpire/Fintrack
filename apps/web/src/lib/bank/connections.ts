/**
 * Connecting, linking and disconnecting a bank, read-only.
 *
 *  - Connecting records the person's consent and nothing else. It does not
 *    create accounts or transactions.
 *  - Linking ties ONE provider account to ONE FinTrack account the person
 *    already has (or just created). Nothing is linked automatically.
 *  - Disconnecting stops all syncing immediately, whether or not the provider
 *    answers, and keeps everything already imported and recorded.
 *  - Everything is scoped to the signed-in user's id.
 */
import type { BankConnection } from "@prisma/client";
import { prisma } from "../db";
import { type ProviderAccount } from "./provider";
import { seedDemoBank } from "./mock-provider";
import { availableProviders, getProvider } from "./registry";

export type ConnectionView = {
  id: string;
  provider: string;
  status: string;
  consentGrantedAt: string;
  lastSuccessAt: string | null;
  lastError: string | null;
  linkedAccounts: { accountId: string; name: string; externalAccountId: string | null }[];
  pendingReview: number;
};

export type ConnectionResult<T = unknown> =
  | { status: "ok"; value: T }
  | { status: "invalid"; error: string }
  | { status: "not_found" };

const MAX_CONNECTIONS_PER_USER = 10;

export async function listConnections(userId: string): Promise<ConnectionView[]> {
  const [connections, accounts, imports] = await Promise.all([
    prisma.bankConnection.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    prisma.account.findMany({ where: { userId, connectionId: { not: null } } }),
    prisma.importedTransaction.findMany({ where: { userId, review: "new" }, select: { connectionId: true } }),
  ]);
  return connections.map((c) => ({
    id: c.id,
    provider: c.provider,
    status: c.status,
    consentGrantedAt: c.consentGrantedAt.toISOString(),
    lastSuccessAt: c.lastSuccessAt?.toISOString() ?? null,
    lastError: c.lastError,
    linkedAccounts: accounts
      .filter((a) => a.connectionId === c.id)
      .map((a) => ({ accountId: a.id, name: a.name, externalAccountId: a.externalAccountId })),
    pendingReview: imports.filter((i) => i.connectionId === c.id).length,
  }));
}

export async function createConnection(
  userId: string,
  providerId: string,
  now: Date = new Date()
): Promise<ConnectionResult<BankConnection>> {
  if (!availableProviders().some((p) => p.id === providerId) || !getProvider(providerId)) {
    return { status: "invalid", error: "That bank provider is not available." };
  }
  if ((await prisma.bankConnection.count({ where: { userId } })) >= MAX_CONNECTIONS_PER_USER) {
    return { status: "invalid", error: `You can have up to ${MAX_CONNECTIONS_PER_USER} bank connections.` };
  }
  const connection = await prisma.bankConnection.create({
    data: { userId, provider: providerId, consentGrantedAt: now },
  });
  // The demo bank starts with invented sample data so the flow can be tried
  if (providerId === "mock") seedDemoBank(connection.id, now);
  return { status: "ok", value: connection };
}

/** The accounts the provider offers for a connection (to choose which to link) */
export async function providerAccounts(
  userId: string,
  connectionId: string
): Promise<ConnectionResult<ProviderAccount[]>> {
  const connection = await prisma.bankConnection.findFirst({ where: { id: connectionId, userId } });
  if (!connection) return { status: "not_found" };
  if (connection.status !== "active") return { status: "invalid", error: `This connection is ${connection.status}.` };
  const provider = getProvider(connection.provider);
  if (!provider) return { status: "invalid", error: "This provider is not available." };
  try {
    return { status: "ok", value: await provider.listAccounts({ id: connection.id, userId }) };
  } catch {
    return { status: "invalid", error: "The bank could not be reached. Try again shortly." };
  }
}

export async function linkAccount(
  userId: string,
  connectionId: string,
  input: { externalAccountId: string; accountId: string }
): Promise<ConnectionResult<null>> {
  const connection = await prisma.bankConnection.findFirst({ where: { id: connectionId, userId } });
  if (!connection) return { status: "not_found" };
  if (connection.status !== "active") return { status: "invalid", error: `This connection is ${connection.status}.` };

  const offered = await providerAccounts(userId, connectionId);
  if (offered.status !== "ok") return offered as ConnectionResult<null>;
  const external = offered.value.find((a) => a.externalId === input.externalAccountId);
  if (!external) return { status: "invalid", error: "The bank does not offer that account." };

  const account = await prisma.account.findFirst({ where: { id: input.accountId, userId } });
  if (!account) return { status: "invalid", error: "Pick one of your accounts." };
  if (account.status !== "active") return { status: "invalid", error: "That account is archived." };
  if (account.currency !== external.currency) {
    return { status: "invalid", error: `That bank account is in ${external.currency}, but ${account.name} holds ${account.currency}.` };
  }
  if (account.connectionId && account.connectionId !== connection.id) {
    return { status: "invalid", error: `${account.name} is already linked to another bank connection.` };
  }
  const taken = await prisma.account.findFirst({
    where: { connectionId: connection.id, externalAccountId: external.externalId },
    select: { id: true },
  });
  if (taken && taken.id !== account.id) {
    return { status: "invalid", error: "That bank account is already linked to a different account." };
  }

  await prisma.account.update({
    where: { id: account.id },
    data: { provider: connection.provider, externalAccountId: external.externalId, connectionId: connection.id },
  });
  return { status: "ok", value: null };
}

/**
 * Withdraw access. The local stop comes first and never depends on the
 * provider: even if revoking there fails, nothing will sync again. Imported and
 * recorded data stays; accounts are unlinked so they can be linked again later.
 */
export async function disconnect(
  userId: string,
  connectionId: string,
  now: Date = new Date()
): Promise<ConnectionResult<{ providerRevoked: boolean }>> {
  const connection = await prisma.bankConnection.findFirst({ where: { id: connectionId, userId } });
  if (!connection) return { status: "not_found" };

  await prisma.bankConnection.update({
    where: { id: connection.id },
    data: { status: "revoked", revokedAt: now, nextRetryAt: null, lastError: null },
  });
  await prisma.account.updateMany({
    where: { connectionId: connection.id, userId },
    data: { connectionId: null },
  });

  let providerRevoked = false;
  const provider = getProvider(connection.provider);
  if (provider) {
    try {
      await provider.revoke({ id: connection.id, userId });
      providerRevoked = true;
    } catch {
      // Already stopped here. The person can also withdraw consent at their bank.
    }
  }
  return { status: "ok", value: { providerRevoked } };
}
