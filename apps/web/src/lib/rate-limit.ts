/**
 * Rate limiting for auth endpoints.
 *
 * Production / Preview: Upstash Redis (UPSTASH_REDIS_REST_URL + TOKEN).
 * Local without Upstash: in-memory sliding windows (process-local only).
 *
 * New deps justified: @upstash/ratelimit + @upstash/redis — serverless-safe
 * sliding-window counters for OTP abuse protection.
 */
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

export type LimitResult = {
  success: boolean;
  limit: number;
  remaining: number;
  /** Epoch ms when the window resets */
  reset: number;
};

type Limiter = {
  limit: (identifier: string) => Promise<LimitResult>;
};

/** In-memory sliding window — local dev / tests only */
function memoryLimiter(max: number, windowMs: number): Limiter {
  const hits = new Map<string, number[]>();
  return {
    async limit(identifier: string): Promise<LimitResult> {
      const now = Date.now();
      const windowStart = now - windowMs;
      const prev = hits.get(identifier) ?? [];
      const recent = prev.filter((t) => t > windowStart);
      if (recent.length >= max) {
        const oldest = recent[0] ?? now;
        return {
          success: false,
          limit: max,
          remaining: 0,
          reset: oldest + windowMs,
        };
      }
      recent.push(now);
      hits.set(identifier, recent);
      return {
        success: true,
        limit: max,
        remaining: max - recent.length,
        reset: now + windowMs,
      };
    },
  };
}

function upstashLimiter(
  redis: Redis,
  max: number,
  window: `${number} ${"s" | "m" | "h" | "d"}`,
  prefix: string
): Limiter {
  const rl = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(max, window),
    prefix,
    analytics: false,
  });
  return {
    async limit(identifier: string): Promise<LimitResult> {
      const res = await rl.limit(identifier);
      return {
        success: res.success,
        limit: res.limit,
        remaining: res.remaining,
        reset: res.reset,
      };
    },
  };
}

function makeLimiter(
  max: number,
  window: `${number} ${"s" | "m" | "h" | "d"}`,
  windowMs: number,
  prefix: string
): Limiter {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (url && token) {
    const redis = new Redis({ url, token });
    return upstashLimiter(redis, max, window, prefix);
  }
  if (process.env.VERCEL === "1") {
    console.warn(
      `[rate-limit] Upstash env missing on Vercel — using in-memory fallback (${prefix}). Configure UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN.`
    );
  }
  return memoryLimiter(max, windowMs);
}

/** 3 OTP requests per email per 10 minutes */
export const otpEmailLimiter = makeLimiter(
  3,
  "10 m",
  10 * 60 * 1000,
  "ft:otp:email"
);

/** 10 OTP requests per IP per hour */
export const otpIpLimiter = makeLimiter(
  10,
  "1 h",
  60 * 60 * 1000,
  "ft:otp:ip"
);

/** 10 verify attempts per IP per 10 minutes */
export const verifyIpLimiter = makeLimiter(
  10,
  "10 m",
  10 * 60 * 1000,
  "ft:otp:verify-ip"
);

/** Client IP from reverse-proxy headers (Vercel / similar). */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = req.headers.get("x-real-ip")?.trim();
  if (real) return real;
  return "unknown";
}

/** Seconds until reset (for Retry-After header). */
export function retryAfterSeconds(result: LimitResult): number {
  return Math.max(1, Math.ceil((result.reset - Date.now()) / 1000));
}
