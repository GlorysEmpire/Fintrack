/**
 * Authentication for scheduled-job endpoints. Closed unless CRON_SECRET is set
 * and matches (Authorization: Bearer <secret> or x-cron-secret); with no secret
 * configured every request is refused. Compared in constant time.
 */
import { timingSafeEqual } from "node:crypto";

function sameSecret(given: string | null, secret: string): boolean {
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function cronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const bearer = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? null;
  return sameSecret(bearer, secret) || sameSecret(req.headers.get("x-cron-secret"), secret);
}
