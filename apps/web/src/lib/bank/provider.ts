/**
 * The boundary between FinTrack and any bank-data provider.
 *
 * Everything provider-specific (endpoints, auth, payload shapes, quirks) lives
 * behind this interface, in one adapter per provider. The rest of the app, and
 * the financial domain, only ever see these shapes. Adapters are READ-ONLY by
 * design: there is no method here that can initiate a payment or move money, so
 * nothing built on it can either.
 *
 * Credentials: this groundwork stores none. When a real provider is chosen, its
 * access tokens must be kept encrypted at rest and never logged.
 */
import type { ImportStatus } from "@fintrack/domain";

export type ProviderAccount = {
  /** The provider's id for the account */
  externalId: string;
  name: string;
  currency: string;
};

export type ProviderTransaction = {
  externalId: string;
  externalAccountId: string;
  status: ImportStatus;
  /** Signed minor units (kobo/cents): money in is positive */
  amountMinor: number;
  currency: string;
  occurredAt: Date;
  description?: string;
  counterparty?: string;
  /** What the provider originally reported, when it differs from the above */
  originalAmountMinor?: number;
  originalCurrency?: string;
};

export type ProviderPage = {
  transactions: ProviderTransaction[];
  /** Where to resume next time (provider-defined); null if the provider has none */
  nextCursor: string | null;
  hasMore: boolean;
};

/** What an adapter needs to know about a connection */
export type ConnectionRef = { id: string; userId: string };

/**
 * `auth`: the person's consent has lapsed or been withdrawn: stop and ask them.
 * `transient`: the provider or network failed: retry later.
 */
export class ProviderError extends Error {
  constructor(
    message: string,
    readonly kind: "auth" | "transient"
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export interface BankProvider {
  readonly id: string;
  listAccounts(connection: ConnectionRef): Promise<ProviderAccount[]>;
  fetchTransactions(connection: ConnectionRef, cursor: string | null): Promise<ProviderPage>;
  /** Withdraw consent at the provider. Best effort: the local disconnect never depends on it. */
  revoke(connection: ConnectionRef): Promise<void>;
}
