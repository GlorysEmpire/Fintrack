/**
 * Password hashing + strength checks.
 * Argon2id only — never store plaintext.
 */
import * as argon2 from "argon2";

/** OWASP-ish Argon2id parameters (interactive login). */
const ARGON2_OPTS = {
  type: argon2.argon2id as 0 | 1 | 2,
  memoryCost: 64 * 1024, // 64 MiB
  timeCost: 3,
  parallelism: 4,
};

const MIN_LEN = 8;
const MAX_LEN = 128;

export type PasswordValidation = {
  ok: boolean;
  error?: string;
  /** Soft recommendation — not a hard failure */
  warning?: string;
};

/**
 * Basic strength rules:
 * - hard: 8–128 characters
 * - recommended: at least one number or symbol
 */
export function validatePasswordStrength(password: string): PasswordValidation {
  if (typeof password !== "string" || password.length < MIN_LEN) {
    return {
      ok: false,
      error: `Password must be at least ${MIN_LEN} characters.`,
    };
  }
  if (password.length > MAX_LEN) {
    return {
      ok: false,
      error: `Password must be at most ${MAX_LEN} characters.`,
    };
  }
  const hasNumberOrSymbol = /[\d\W_]/.test(password);
  if (!hasNumberOrSymbol) {
    return {
      ok: true,
      warning:
        "Tip: add a number or symbol for a stronger password (recommended).",
    };
  }
  return { ok: true };
}

export async function hashPassword(password: string): Promise<string> {
  const check = validatePasswordStrength(password);
  if (!check.ok) {
    throw new Error(check.error || "Invalid password");
  }
  // PHC-encoded string (default raw: false)
  return argon2.hash(password, ARGON2_OPTS);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  if (!password || !hash) return false;
  try {
    return await argon2.verify(hash, password);
  } catch {
    // Malformed hash or runtime error — treat as failed verify
    return false;
  }
}
