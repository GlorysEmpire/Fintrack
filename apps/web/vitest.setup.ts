/**
 * Shared Vitest setup — no external services required for unit tests.
 */
process.env.AUTH_DEV_SHOW_CODE = "true";
// The scripted demo bank is allowed in tests (it is refused in production)
process.env.BANK_MOCK_ENABLED = "true";
process.env.SESSION_SECRET = "test-session-secret-32chars-minimum";
// Force in-memory rate limiters (no Upstash in unit tests)
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;
