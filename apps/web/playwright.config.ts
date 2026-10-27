import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests drive a real browser against a real server and a real
 * database. They create users and records, so they must NEVER run against live
 * data. This config therefore refuses to start unless E2E_DATABASE_URL points at
 * this machine and its database name contains "test", and it hands that URL to
 * the server it starts, overriding whatever apps/web/.env says.
 */
const dbUrl = process.env.E2E_DATABASE_URL ?? "";
function assertThrowaway(raw: string) {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Set E2E_DATABASE_URL to a throwaway local PostgreSQL database, e.g. postgresql://user@localhost:5432/fintrack_test");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const name = url.pathname.replace(/^\//, "");
  if (!["localhost", "127.0.0.1", "::1"].includes(host) || !name.toLowerCase().includes("test")) {
    throw new Error(`Refusing to run end-to-end tests against "${host}/${name}": it must be local and its name must contain "test".`);
  }
}
assertThrowaway(dbUrl);

const port = 3456;
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      // E2E_BROWSER_CHANNEL=chrome uses the installed Google Chrome instead of a downloaded Chromium
      use: { ...devices["Desktop Chrome"], channel: process.env.E2E_BROWSER_CHANNEL || undefined },
    },
  ],
  webServer: {
    command: "npm run dev -w @fintrack/web",
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
    cwd: "../..",
    env: {
      DATABASE_URL: dbUrl,
      SESSION_SECRET: "e2e-session-secret-0123456789abcdef",
      BANK_MOCK_ENABLED: "true",
      // No email is ever sent from a test run
      RESEND_API_KEY: "",
    },
  },
});
