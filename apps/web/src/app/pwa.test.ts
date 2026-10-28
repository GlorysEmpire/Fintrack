/**
 * The installable app: a valid manifest whose icons exist, and a service worker
 * that can never put the user's financial data on the device.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import manifest from "./manifest";

const PUBLIC = path.join(__dirname, "../../public");

describe("the web app manifest", () => {
  const m = manifest();

  it("lets a phone install it as its own full-screen app", () => {
    expect(m).toMatchObject({ name: "FinTrack", short_name: "FinTrack", display: "standalone", scope: "/" });
    expect(m.start_url).toBe("/dashboard");
    expect(m.start_url!.startsWith(m.scope!)).toBe(true);
    expect(m.background_color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(m.theme_color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("has every icon a phone asks for, as real files", () => {
    const icons = m.icons ?? [];
    expect(icons.some((i) => i.sizes === "192x192")).toBe(true);
    expect(icons.some((i) => i.sizes === "512x512" && i.purpose === "any")).toBe(true);
    expect(icons.some((i) => i.purpose === "maskable")).toBe(true);
    for (const icon of icons) {
      expect(existsSync(path.join(PUBLIC, icon.src)), icon.src).toBe(true);
    }
    expect(existsSync(path.join(PUBLIC, "icons/apple-touch-icon.png"))).toBe(true);
  });
});

/** Run public/sw.js against a recording fake of the service worker environment */
function loadServiceWorker(fetchImpl: (req: { url: string }) => Promise<unknown>) {
  const handlers: Record<string, (event: unknown) => void> = {};
  const stored = new Map<string, unknown>();
  const put: string[] = [];
  const cache = {
    addAll: async (urls: string[]) => urls.forEach((u) => stored.set(u, { cached: u })),
    put: async (req: { url: string }) => {
      put.push(new URL(req.url).pathname);
      stored.set(new URL(req.url).pathname, { cached: req.url });
    },
  };
  const self = {
    location: { origin: "https://app.test" },
    addEventListener: (type: string, fn: (event: unknown) => void) => (handlers[type] = fn),
    skipWaiting: () => undefined,
    clients: { claim: async () => undefined },
  };
  const sandbox = {
    self,
    URL,
    Response: { error: () => ({ error: true }) },
    caches: {
      open: async () => cache,
      keys: async () => [],
      delete: async () => true,
      match: async (req: string | { url: string }) => stored.get(typeof req === "string" ? req : new URL(req.url).pathname),
    },
    fetch: fetchImpl,
  };
  vm.runInNewContext(readFileSync(path.join(PUBLIC, "sw.js"), "utf8"), sandbox);

  /** Fire a fetch event; resolves with what the worker answered, or "ignored" if it did not intercept */
  async function request(url: string, opts: { method?: string; mode?: string } = {}) {
    let answer: Promise<unknown> | undefined;
    handlers.fetch({
      request: { url, method: opts.method ?? "GET", mode: opts.mode ?? "no-cors" },
      respondWith: (p: Promise<unknown>) => (answer = p),
    });
    return answer ? await answer : "ignored";
  }
  return { request, put, stored, handlers, cache };
}

const offline = () => Promise.reject(new Error("offline"));
const okResponse = (body = "x") => ({ ok: true, body, clone() { return this; } });

describe("the service worker never keeps the user's money on the phone", () => {
  it("does not touch the API at all, online or offline", async () => {
    const sw = loadServiceWorker(async () => okResponse("secret balance"));
    for (const url of ["https://app.test/api/accounts", "https://app.test/api/export", "https://app.test/api/transactions"]) {
      expect(await sw.request(url)).toBe("ignored");
    }
    expect(sw.put).toEqual([]);
  });

  it("never caches a page, and offline shows the offline screen, not old data", async () => {
    let online = true;
    const sw = loadServiceWorker(async () => (online ? okResponse("<html>my balances</html>") : offline()));
    await sw.handlers.install({ waitUntil: () => undefined });
    const whileOnline = await sw.request("https://app.test/accounts", { mode: "navigate" });
    expect(whileOnline).toMatchObject({ body: "<html>my balances</html>" });
    online = false;
    const whileOffline = await sw.request("https://app.test/accounts", { mode: "navigate" });
    expect(whileOffline).toEqual({ cached: "/offline.html" });
    // nothing about the page was ever written to the cache
    expect(sw.put).toEqual([]);
    expect([...sw.stored.keys()].some((k) => k.includes("accounts"))).toBe(false);
  });

  it("never touches writes or other websites", async () => {
    const sw = loadServiceWorker(async () => okResponse());
    expect(await sw.request("https://app.test/api/transactions", { method: "POST" })).toBe("ignored");
    expect(await sw.request("https://app.test/anything", { method: "DELETE" })).toBe("ignored");
    expect(await sw.request("https://elsewhere.test/_next/static/a.js")).toBe("ignored");
  });

  it("caches only the app's own static files", async () => {
    const sw = loadServiceWorker(async () => okResponse("js"));
    await sw.request("https://app.test/_next/static/chunks/app.js");
    await sw.request("https://app.test/icons/icon-192.png");
    await new Promise((r) => setTimeout(r, 0));
    expect(sw.put.sort()).toEqual(["/_next/static/chunks/app.js", "/icons/icon-192.png"].sort());
    // a data-looking request that is not static is not intercepted or cached
    expect(await sw.request("https://app.test/dashboard.json")).toBe("ignored");
  });

  it("pre-caches the offline page and nothing else of the app", async () => {
    const sw = loadServiceWorker(async () => okResponse());
    let waited: Promise<unknown> | undefined;
    sw.handlers.install({ waitUntil: (p: Promise<unknown>) => (waited = p) });
    await waited;
    expect([...sw.stored.keys()].sort()).toEqual(["/icons/icon-192.png", "/icons/icon-512.png", "/offline.html"]);
  });
});
