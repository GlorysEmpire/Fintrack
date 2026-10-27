/**
 * A scripted, in-memory stand-in for a bank provider. For tests and local
 * demos only: it talks to no bank, holds no credentials and moves no money.
 *
 * It is refused outright in production (see mockBankEnabled).
 */
import {
  ProviderError,
  type BankProvider,
  type ConnectionRef,
  type ProviderAccount,
  type ProviderPage,
  type ProviderTransaction,
} from "./provider";

export type MockScript = {
  accounts: ProviderAccount[];
  /** Everything the "bank" knows, oldest first. Edit it to simulate pending → posted, reversals, corrections. */
  transactions: ProviderTransaction[];
  /** Transactions returned per page */
  pageSize: number;
  /** Make the next N calls fail (see failKind) */
  failNext: number;
  failKind: "auth" | "transient";
  revoked: boolean;
};

// Kept on globalThis so every route bundle in one server process sees the same
// scripted bank (each route is compiled separately in development).
const globalForMock = globalThis as unknown as { __ftMockBank?: Map<string, MockScript> };
const scripts = (globalForMock.__ftMockBank ??= new Map<string, MockScript>());

export function mockBankEnabled(): boolean {
  if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") return false;
  return process.env.BANK_MOCK_ENABLED === "true";
}

/** Set (or replace) what the mock bank says for one connection. */
export function scriptMockBank(connectionId: string, script: Partial<MockScript>): MockScript {
  const full: MockScript = {
    accounts: [],
    transactions: [],
    pageSize: 50,
    failNext: 0,
    failKind: "transient",
    revoked: false,
    ...script,
  };
  scripts.set(connectionId, full);
  return full;
}

export function mockBankScript(connectionId: string): MockScript | undefined {
  return scripts.get(connectionId);
}

/** Sample data for trying the review flow locally: invented, no real bank involved */
export function seedDemoBank(connectionId: string, now: Date = new Date()): MockScript {
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);
  const tx = (id: string, amountMinor: number, ago: number, description: string, status: ProviderTransaction["status"] = "posted"): ProviderTransaction => ({
    externalId: id,
    externalAccountId: "demo-current",
    status,
    amountMinor,
    currency: "NGN",
    occurredAt: daysAgo(ago),
    description,
  });
  return scriptMockBank(connectionId, {
    accounts: [{ externalId: "demo-current", name: "Demo Current Account", currency: "NGN" }],
    transactions: [
      tx("demo-1", 25_000_000, 5, "Salary (demo)"),
      tx("demo-2", -1_850_000, 3, "Supermarket (demo)"),
      tx("demo-3", -300_000, 2, "Transport (demo)"),
      tx("demo-4", -420_000, 0, "Restaurant (demo)", "pending"),
    ],
  });
}

export function resetMockBank() {
  scripts.clear();
}

function scriptFor(connection: ConnectionRef): MockScript {
  const script = scripts.get(connection.id);
  if (!script) throw new ProviderError("The demo bank has nothing for this connection.", "auth");
  if (script.revoked) throw new ProviderError("Consent was withdrawn.", "auth");
  if (script.failNext > 0) {
    script.failNext -= 1;
    throw new ProviderError("The demo bank is unavailable.", script.failKind);
  }
  return script;
}

export const mockProvider: BankProvider = {
  id: "mock",

  async listAccounts(connection) {
    return scriptFor(connection).accounts;
  },

  async fetchTransactions(connection, cursor): Promise<ProviderPage> {
    const script = scriptFor(connection);
    const start = cursor ? Number(cursor) : 0;
    if (!Number.isInteger(start) || start < 0) {
      throw new ProviderError("The demo bank did not recognise that position.", "transient");
    }
    const page = script.transactions.slice(start, start + script.pageSize);
    const end = start + page.length;
    return {
      transactions: page,
      nextCursor: String(end),
      hasMore: end < script.transactions.length,
    };
  },

  async revoke(connection) {
    const script = scripts.get(connection.id);
    if (script) script.revoked = true;
  },
};
