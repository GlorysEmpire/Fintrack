/**
 * Request shapes and response mapping for the recurring-rule routes.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError } from "@/lib/api";
import type { RuleResult } from "@/lib/recurring-rules";

const currency = z.enum(["NGN", "USD", "GBP", "EUR"]);
const amount = z
  .number()
  .finite()
  .positive("Enter an amount above 0.")
  .max(1_000_000_000_000, "That amount is too large.");
const id = z.string().max(64);
const cadence = z.enum(["daily", "weekly", "monthly"]);
const dayOfMonth = z.number().int().min(1).max(31);
const day = z.string().max(10);

export const createRuleSchema = z
  .object({
    type: z.enum(["i", "e"]),
    amount,
    currency: currency.default("NGN"),
    bucketId: id.optional().nullable(),
    sourceId: id.optional().nullable(),
    note: z.string().max(500).optional().nullable(),
    cadence,
    dayOfMonth: dayOfMonth.optional().nullable(),
    startDate: day.optional().nullable(),
  })
  .strict();

/** Every field optional: only what changed is sent. `type` can not change. */
export const updateRuleSchema = z
  .object({
    amount: amount.optional(),
    currency: currency.optional(),
    bucketId: id.optional().nullable(),
    sourceId: id.optional().nullable(),
    note: z.string().max(500).optional().nullable(),
    cadence: cadence.optional(),
    dayOfMonth: dayOfMonth.optional().nullable(),
    startDate: day.optional().nullable(),
    active: z.boolean().optional(),
  })
  .strict();

/** 200 saved · 400 not valid · 404 not yours / not found */
export function ruleResponse(result: RuleResult) {
  switch (result.status) {
    case "ok":
      return NextResponse.json({ ok: true, rule: result.rule });
    case "invalid":
      return jsonError(400, result.error);
    case "not_found":
      return jsonError(404, "Not found");
  }
}
