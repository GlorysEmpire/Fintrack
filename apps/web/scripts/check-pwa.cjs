/**
 * Manual check of the installable app against a RUNNING production build
 * (`next build && next start`), in real Chrome:
 *   node apps/web/scripts/check-pwa.cjs http://localhost:3458
 * It installs the service worker, goes offline, and expects the offline screen.
 */
const { chromium } = require("@playwright/test");

(async () => {
  const base = process.argv[2] || "http://localhost:3458";
  const browser = await chromium.launch({ channel: "chrome" });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(`${base}/login`);
  await page.evaluate(() => navigator.serviceWorker.ready);
  const registered = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    return Boolean(reg && reg.active);
  });
  const cached = await page.evaluate(async () => {
    const out = [];
    for (const key of await caches.keys()) {
      const cache = await caches.open(key);
      for (const req of await cache.keys()) out.push(new URL(req.url).pathname);
    }
    return out.sort();
  });

  // Reload once so the page is controlled by the worker, then go offline
  await page.reload();
  await context.setOffline(true);
  await page.goto(`${base}/login`).catch(() => undefined);
  const offlineText = await page.locator("h1").first().innerText().catch(() => "(no page)");

  console.log(JSON.stringify({ registered, cached, offlineShows: offlineText }, null, 2));
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
