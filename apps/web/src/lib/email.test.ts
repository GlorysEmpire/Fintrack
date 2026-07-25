import { afterEach, describe, expect, it } from "vitest";
import { isDevShowCode } from "./email";

const keys = ["AUTH_DEV_SHOW_CODE", "VERCEL", "VERCEL_ENV"] as const;

const snapshot: Partial<Record<(typeof keys)[number], string | undefined>> = {};

function setEnv(env: Partial<Record<(typeof keys)[number], string | undefined>>) {
  for (const k of keys) {
    if (!(k in snapshot)) snapshot[k] = process.env[k];
    const v = env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

afterEach(() => {
  for (const k of keys) {
    const v = snapshot[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("isDevShowCode", () => {
  it("allows local when flag is true", () => {
    setEnv({ AUTH_DEV_SHOW_CODE: "true", VERCEL: undefined, VERCEL_ENV: undefined });
    expect(isDevShowCode()).toBe(true);
  });

  it("never leaks on Vercel production even if flag is true", () => {
    setEnv({
      AUTH_DEV_SHOW_CODE: "true",
      VERCEL: "1",
      VERCEL_ENV: "production",
    });
    expect(isDevShowCode()).toBe(false);
  });

  it("never leaks on Vercel preview", () => {
    setEnv({
      AUTH_DEV_SHOW_CODE: "true",
      VERCEL: "1",
      VERCEL_ENV: "preview",
    });
    expect(isDevShowCode()).toBe(false);
  });

  it("allows Vercel development only", () => {
    setEnv({
      AUTH_DEV_SHOW_CODE: "true",
      VERCEL: "1",
      VERCEL_ENV: "development",
    });
    expect(isDevShowCode()).toBe(true);
  });

  it("is false when flag is off on local", () => {
    setEnv({
      AUTH_DEV_SHOW_CODE: "false",
      VERCEL: undefined,
      VERCEL_ENV: undefined,
    });
    expect(isDevShowCode()).toBe(false);
  });
});
