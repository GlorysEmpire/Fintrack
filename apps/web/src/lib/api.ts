/**
 * Shared helpers for API route responses.
 *
 * Every error a route sends is one plain sentence. Unexpected failures are
 * logged by kind only (never the request body, never amounts or notes) and the
 * client gets a generic message, so nothing financial ends up in logs and no
 * schema or database internals reach the browser.
 */
import { NextResponse } from "next/server";
import { ZodError } from "zod";

export function jsonError(
  status: number,
  error: string,
  extra: Record<string, unknown> = {},
  headers?: Record<string, string>
) {
  return NextResponse.json(
    { ok: false, error, ...extra },
    { status, ...(headers ? { headers } : {}) }
  );
}

export function unauthorized() {
  return jsonError(401, "Unauthorized");
}

/** One sentence for a request with the wrong shape. */
export function zodMessage(e: ZodError): string {
  const issue = e.issues[0];
  if (!issue) return "The request was not valid.";
  if (issue.code === "unrecognized_keys") {
    return `Unknown field: ${issue.keys.join(", ")}.`;
  }
  const where = issue.path.length ? `${issue.path.join(".")}: ` : "";
  return `${where}${issue.message}`;
}

/** Turn anything a route's try block threw into a safe response. */
export function routeError(e: unknown, route: string) {
  if (e instanceof ZodError) return jsonError(400, zodMessage(e));
  if (e instanceof SyntaxError) {
    return jsonError(400, "The request was not valid JSON.");
  }
  const kind =
    e && typeof e === "object"
      ? `${(e as { name?: string }).name ?? "Error"}${
          "code" in e ? ` ${String((e as { code?: unknown }).code)}` : ""
        }`
      : "Error";
  console.error(`[${route}] request failed: ${kind}`);
  return jsonError(500, "Something went wrong. Please try again.");
}
