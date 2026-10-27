/**
 * Which provider adapters exist. Adding a real provider means writing one
 * adapter file and registering it here: nothing else changes.
 */
import { mockBankEnabled, mockProvider } from "./mock-provider";
import type { BankProvider } from "./provider";

export function getProvider(id: string): BankProvider | null {
  if (id === "mock" && mockBankEnabled()) return mockProvider;
  return null;
}

/** The providers a user may connect right now */
export function availableProviders(): { id: string; label: string }[] {
  return mockBankEnabled() ? [{ id: "mock", label: "Demo bank (test data, no real bank)" }] : [];
}
