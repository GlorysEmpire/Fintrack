import { expect, test } from "@playwright/test";

/**
 * E2E: request OTP (dev code) → verify → dashboard → log income → see it listed.
 * Requires AUTH_DEV_SHOW_CODE=true and a working DATABASE_URL.
 */
test("login with OTP, log a transaction, see it on dashboard", async ({
  page,
}) => {
  const email = `e2e-${Date.now()}@example.com`;

  await page.goto("/login");
  await page.getByPlaceholder("you@example.com").fill(email);
  await page.getByRole("button", { name: /send login code/i }).click();

  // Dev mode surfaces the code on the page
  const dev = page.locator(".dev-code strong, [data-testid=dev-code]");
  await expect(dev.first()).toBeVisible({ timeout: 15_000 });
  const code = (await dev.first().innerText()).trim();
  expect(code).toMatch(/^\d{6}$/);

  await page.getByPlaceholder("123456").fill(code);
  await page.getByRole("button", { name: /sign in/i }).click();

  // Onboarding or dashboard
  await page.waitForURL(/\/(onboarding|dashboard)/, { timeout: 20_000 });
  if (page.url().includes("/onboarding")) {
    // Skip or pick default if present
    const skip = page.getByRole("button", { name: /skip/i });
    if (await skip.isVisible().catch(() => false)) {
      await skip.click();
    } else {
      const start = page.getByRole("button", { name: /start|continue|use/i }).first();
      if (await start.isVisible().catch(() => false)) await start.click();
    }
    await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
  }

  await expect(page.getByText(/finance dashboard|overview|income/i).first()).toBeVisible({
    timeout: 15_000,
  });

  // Open FAB / log modal
  const fab = page.locator(".fab, [data-testid=fab], button:has-text('+')").first();
  await fab.click();
  await expect(page.getByText(/log|income|expense/i).first()).toBeVisible();

  // Prefer income tab if present
  const incomeTab = page.getByRole("button", { name: /^income$/i });
  if (await incomeTab.isVisible().catch(() => false)) {
    await incomeTab.click();
  }

  const amount = page.locator('input[type="number"], input[name="amount"]').first();
  await amount.fill("25000");

  const submit = page.getByRole("button", { name: /log|save|add|confirm/i }).first();
  await submit.click();

  // Modal closes; list or metrics refresh
  await expect(page.locator(".tx-item, .bucket-tx, .m-val").first()).toBeVisible({
    timeout: 15_000,
  });
});
