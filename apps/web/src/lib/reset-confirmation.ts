/**
 * The words a user must type before Reset FinTrack does anything.
 * Shared by the dialog and the API (the API checks it again: the dialog is a
 * convenience, the server is the gate).
 */
export const RESET_CONFIRMATION_PHRASE = "RESET FINTRACK";

/** Case and extra spaces are forgiven; anything else is not a confirmation. */
export function isResetConfirmed(typed: unknown): boolean {
  if (typeof typed !== "string") return false;
  return (
    typed.trim().replace(/\s+/g, " ").toUpperCase() === RESET_CONFIRMATION_PHRASE
  );
}
