/**
 * Request shapes and response mapping for the read-only bank routes.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError } from "@/lib/api";
import type { ReviewResult } from "@/lib/bank/review";

const id = z.string().max(64);

export const createConnectionSchema = z.object({ provider: z.string().max(30) }).strict();

export const connectionActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("accounts") }).strict(),
  z.object({ action: z.literal("sync") }).strict(),
  z.object({ action: z.literal("link"), externalAccountId: z.string().max(200), accountId: id }).strict(),
]);

export const importActionSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("accept"),
      bucketId: id.optional().nullable(),
      category: id.optional().nullable(),
      sourceId: id.optional().nullable(),
      note: z.string().max(500).optional().nullable(),
      fundFrom: z.object({ bucketId: id, reason: z.string().max(500) }).strict().optional(),
    })
    .strict(),
  z.object({ action: z.literal("match"), transactionId: id }).strict(),
  z.object({ action: z.literal("ignore") }).strict(),
  z.object({ action: z.literal("reopen") }).strict(),
  z.object({ action: z.literal("acknowledge") }).strict(),
]);

/** 200 done · 400 not valid · 404 not yours / not found · 422 the bucket can not cover it */
export function reviewResponse(result: ReviewResult) {
  switch (result.status) {
    case "ok":
      return NextResponse.json({ ok: true });
    case "invalid":
      return jsonError(400, result.error);
    case "blocked":
      return jsonError(422, result.error, { blocked: true, shortfall: result.shortfall });
    case "not_found":
      return jsonError(404, "Not found");
  }
}
