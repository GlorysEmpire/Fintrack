/**
 * The critical path, in a real browser: set up accounts, move money between
 * them with a fee, spend, see trends, export, and check the pages work on a
 * phone and expose proper labels.
 *
 * Sign-in is by a session seeded straight into the throwaway database (the
 * login screens have their own tests); nothing here touches real data.
 */
import { PrismaClient } from "@prisma/client";
import { expect, test, type Page } from "@playwright/test";
import { TITHE_FIRST_TEMPLATE } from "@fintrack/domain";

const prisma = new PrismaClient({ datasourceUrl: process.env.E2E_DATABASE_URL });

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.afterEach(async () => {
  // Each test made its own throwaway user; remove them all (cascades to their rows)
  await prisma.user.deleteMany({ where: { email: { startsWith: "e2e-" } } });
});

async function signedInUser(page: Page) {
  const stamp = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
  const user = await prisma.user.create({
    data: { email: `e2e-${stamp}@example.test`, onboarding: "completed" },
  });
  await prisma.budgetPlan.create({
    data: {
      userId: user.id,
      name: "Tithe-first waterfall",
      templateId: "tithe_first",
      bucketsJson: JSON.stringify(TITHE_FIRST_TEMPLATE.plan.buckets),
    },
  });
  await prisma.transaction.create({
    data: { userId: user.id, type: "i", amount: 100_000, currency: "NGN", date: new Date() },
  });
  const token = `e2e-token-${stamp}`;
  await prisma.session.create({
    data: { userId: user.id, token, expiresAt: new Date(Date.now() + 3_600_000) },
  });
  await page.context().addCookies([{ name: "ft_session", value: token, url: "http://127.0.0.1:3456" }]);
  return user;
}

async function addAccount(page: Page, name: string, opening?: string, openedOn?: string) {
  await page.getByRole("button", { name: "+ Add account" }).click();
  await page.getByLabel("Account name").fill(name);
  if (opening !== undefined) await page.getByLabel("Opening balance").fill(opening);
  if (openedOn) await page.getByLabel("Balance as of").fill(openedOn);
  await page.getByRole("button", { name: "Save account" }).click();
  await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
}

test("accounts, a transfer with a fee, spending, trends and export", async ({ page }) => {
  await signedInUser(page);
  await page.goto("/accounts");

  await addAccount(page, "GTBank", "50000");
  await addAccount(page, "Cash", "0");
  await expect(page.getByText("₦50,000.00").first()).toBeVisible();

  // A transfer with a fee: money moves, the fee is a real expense from a bucket
  await page.getByRole("button", { name: "Transfer between accounts" }).click();
  await page.getByLabel("From account").selectOption({ label: "From: GTBank (NGN)" });
  await page.getByLabel("To account").selectOption({ label: "To: Cash (NGN)" });
  await page.getByLabel(/Amount sent/).fill("10000");
  await page.getByLabel("Fee (optional)").fill("50");
  await page.getByLabel("Bucket the fee is spent from").selectOption({ label: "Fee from: 💸 Spend" });
  await page.getByRole("button", { name: "Record transfer" }).click();
  await expect(page.getByText("recorded as an expense")).toBeVisible();
  await expect(page.getByText("₦39,950.00").first()).toBeVisible(); // 50,000 − 10,000 − 50
  await expect(page.getByText("₦10,000.00").first()).toBeVisible();

  // An expense over the bucket's balance is blocked (Spend holds ₦8,100, ₦50 already used)
  const blocked = await page.request.post("/api/transactions", {
    data: { type: "e", amount: 9_000, currency: "NGN", bucketId: "spend", category: "food" },
  });
  expect(blocked.status()).toBe(422);

  const accounts = (await (await page.request.get("/api/accounts")).json()).accounts as { id: string; name: string }[];
  const gt = accounts.find((a) => a.name === "GTBank")!.id;
  const allowed = await page.request.post("/api/transactions", {
    data: { type: "e", amount: 2_000, currency: "NGN", bucketId: "spend", category: "food", accountId: gt },
  });
  expect(allowed.status()).toBe(200);

  // Balances moved exactly once each
  await page.reload();
  await expect(page.getByText("₦37,950.00").first()).toBeVisible(); // 39,950 − 2,000

  // Trends tell the truth about this month, and say what they can not know
  await page.goto("/trends");
  await expect(page.getByRole("heading", { name: "Trends" })).toBeVisible();
  await expect(page.getByText("What stands out")).toBeVisible();
  await expect(page.getByText("in progress").first()).toBeVisible();
  await expect(page.getByText("Surplus is income minus expenses")).toBeVisible();

  // Export: exact amounts, the fee as an expense linked to the transfer
  const csv = await (await page.request.get("/api/export?type=transactions")).text();
  expect(csv).toContain(",50.00,NGN,GTBank,Spend,");
  expect(csv).toContain(",2000.00,NGN,GTBank,Spend,food,");
  const json = await (await page.request.get("/api/export")).json();
  expect(json.transfers).toHaveLength(1);
  expect(json.transfers[0]).toMatchObject({ amountSent: "10000.00", fee: "50.00" });
});

test("a bank import is read-only: review, record once, no duplicates", async ({ page }) => {
  await signedInUser(page);
  await page.goto("/accounts");
  // Opened well before the bank's transactions: records dated earlier than an account's opening are refused
  await addAccount(page, "GTBank", "0", "2026-01-01");

  // Connect the demo bank and link its account through the API
  const made = await (await page.request.post("/api/bank/connections", { data: { provider: "mock" } })).json();
  const id = made.connectionId as string;
  const accounts = (await (await page.request.get("/api/accounts")).json()).accounts as { id: string; name: string }[];
  const gt = accounts.find((a) => a.name === "GTBank")!.id;
  expect((await page.request.post(`/api/bank/connections/${id}`, { data: { action: "link", externalAccountId: "demo-current", accountId: gt } })).status()).toBe(200);
  expect((await page.request.post(`/api/bank/connections/${id}`, { data: { action: "sync" } })).status()).toBe(200);

  // Syncing created no transaction of FinTrack's
  const before = await (await page.request.get("/api/export")).json();
  expect(before.transactions.filter((t: { bankImportId: string | null }) => t.bankImportId)).toHaveLength(0);

  await page.goto("/imports");
  await expect(page.getByText("Waiting for the bank to post it")).toBeVisible(); // the pending one
  await expect(page.getByText("Salary (demo)")).toBeVisible();

  // Record the salary credit once
  const card = page.locator(".card", { hasText: "Salary (demo)" });
  await card.getByRole("button", { name: "Record it" }).click();
  await expect(page.getByText("Salary (demo)")).toHaveCount(0);
  const after = await (await page.request.get("/api/export")).json();
  expect(after.transactions.filter((t: { bankImportId: string | null }) => t.bankImportId)).toHaveLength(1);

  // Syncing again never brings it back or doubles it
  await page.waitForTimeout(31_000); // the minimum gap between manual syncs
  await page.request.post(`/api/bank/connections/${id}`, { data: { action: "sync" } });
  const again = await (await page.request.get("/api/export")).json();
  expect(again.transactions.filter((t: { bankImportId: string | null }) => t.bankImportId)).toHaveLength(1);
});

for (const path of ["/accounts", "/trends", "/imports", "/settings", "/dashboard", "/expenses"]) {
  test(`${path} fits a phone and its controls have names`, async ({ page }) => {
    await signedInUser(page);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({ timeout: 15_000 });

    // No sideways scrolling of the whole page (tables scroll inside their own box)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, "the page is wider than the phone screen").toBeLessThanOrEqual(1);

    // Every form control has an accessible name
    const unnamed = await page.evaluate(() => {
      const named = (el: Element) => {
        const id = el.getAttribute("id");
        return Boolean(
          el.getAttribute("aria-label") ||
            el.getAttribute("aria-labelledby") ||
            (id && document.querySelector(`label[for="${id}"]`)) ||
            el.closest("label")
        );
      };
      return [...document.querySelectorAll("input:not([type=hidden]), select, textarea")]
        .filter((el) => !named(el))
        .map((el) => el.outerHTML.slice(0, 80));
    });
    expect(unnamed, "form controls without a label").toEqual([]);

    // Every button and link has text or a name
    const nameless = await page.evaluate(() =>
      [...document.querySelectorAll("button, a[href]")]
        .filter((el) => !(el.textContent || "").trim() && !el.getAttribute("aria-label") && !el.getAttribute("title") && !el.querySelector("[aria-label]"))
        .map((el) => el.outerHTML.slice(0, 80))
    );
    expect(nameless, "buttons or links with no name").toEqual([]);
  });
}
