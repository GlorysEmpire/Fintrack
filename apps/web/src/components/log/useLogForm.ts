"use client";

/**
 * State and rules of the log sheet. A bucket is blocked at zero (never a hint to
 * use another bucket); the only way past is the explicit, reasoned exception.
 */
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  activeBuckets,
  allocateWaterfall,
  amountInBase,
  formatMoney,
  isCrossBucket,
  sortBucketsByPlanOrder,
  streakAfterLoggingToday,
  transactionLockState,
  type CurrencyCode,
} from "@fintrack/domain";
import { toDateInputValue } from "@/lib/format-date";
import { celebrate } from "@/lib/confetti";
import { toast } from "@/components/ui/toast";
import type { LogFormProps, Shortfall } from "./types";

export const CURRENCIES: CurrencyCode[] = ["NGN", "USD", "GBP", "EUR"];

export function useLogForm({
  open,
  onClose,
  plan,
  sources,
  accounts = [],
  baseCurrency,
  fx,
  bucketRemaining = {},
  monthIncome = 0,
  editing = null,
  streak = { current: 0, loggedToday: false },
}: LogFormProps) {
  const router = useRouter();
  const base = baseCurrency as CurrencyCode;
  const isEdit = Boolean(editing);

  const [type, setType] = useState<"i" | "e">("e");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<CurrencyCode>(base || "NGN");
  const [sourceId, setSourceId] = useState(sources[0]?.id || "");
  const [bucketId, setBucketId] = useState("");
  const [category, setCategory] = useState("food");
  const [note, setNote] = useState("");
  const [accountId, setAccountId] = useState("");
  // An expense bigger than its bucket: the user may approve funding the shortfall from another bucket
  const [shortfall, setShortfall] = useState<Shortfall | null>(null);
  const [fundBucket, setFundBucket] = useState("");
  const [fundReason, setFundReason] = useState("");
  const [fundConfirm, setFundConfirm] = useState(false);
  const [dateKey, setDateKey] = useState("");
  const [todayKey, setTodayKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Active buckets in the order the plan fills them. When editing a
  // transaction whose bucket has since been archived, keep that one selectable.
  const buckets = useMemo(() => {
    if (!plan) return [];
    const list = sortBucketsByPlanOrder(activeBuckets(plan.buckets));
    const current = plan.buckets.find((b) => b.id === editing?.bucketId);
    if (current?.archived) list.push(current);
    return list;
  }, [plan, editing]);

  // Reset form when opened (default Expense), or load the transaction being edited
  useEffect(() => {
    if (!open) return;
    const today = toDateInputValue(new Date());
    setTodayKey(today);
    setError(null);

    if (editing) {
      setType(editing.type === "i" ? "i" : "e");
      setAmount(String(editing.amount));
      setCurrency(editing.currency as CurrencyCode);
      setSourceId(editing.sourceId || sources[0]?.id || "");
      setBucketId(editing.bucketId || "");
      setCategory(editing.category || "food");
      setNote(editing.note || "");
      setAccountId(editing.accountId || "");
      setDateKey(toDateInputValue(editing.date));
      return;
    }

    const active = plan ? sortBucketsByPlanOrder(activeBuckets(plan.buckets)) : [];
    setType("e");
    setAmount("");
    setCurrency(base || "NGN");
    setSourceId(sources[0]?.id || "");
    setBucketId(active.find((b) => b.id === "spend")?.id || active[0]?.id || "");
    setCategory("food");
    setNote("");
    setAccountId("");
    setShortfall(null);
    setDateKey(today);
  }, [open, editing, base, sources, plan]);

  // An account holds one currency, so only those in the chosen currency apply
  const accountChoices = accounts.filter((a) => a.currency === currency);
  useEffect(() => {
    if (accountId && !accountChoices.some((a) => a.id === accountId)) {
      setAccountId("");
    }
  }, [accountChoices, accountId]);

  const amtNum = parseFloat(amount) || 0;
  const amountBase = amountInBase(amtNum, currency, baseCurrency, fx);
  const backdated = Boolean(dateKey) && dateKey !== todayKey;
  /** The live balance hint is this month's: it only applies to this month's dates */
  const inCurrentMonth = dateKey.slice(0, 7) === todayKey.slice(0, 7);

  const selectedBucket = buckets.find((b) => b.id === bucketId);

  // What this bucket can cover right now. When editing, the transaction's own
  // amount is added back: it is being replaced, not added to.
  const remaining = useMemo(() => {
    if (type !== "e" || !inCurrentMonth) return undefined;
    if (!(bucketId in bucketRemaining)) return undefined;
    let left = bucketRemaining[bucketId];
    if (
      editing &&
      editing.type === "e" &&
      editing.bucketId === bucketId &&
      toDateInputValue(editing.date).slice(0, 7) === todayKey.slice(0, 7)
    ) {
      left += amountInBase(editing.amount, editing.currency, baseCurrency, fx);
    }
    return left;
  }, [type, inCurrentMonth, bucketId, bucketRemaining, editing, todayKey, baseCurrency, fx]);

  const cross =
    type === "e" && bucketId && category
      ? isCrossBucket(bucketId, category)
      : false;
  /** More than the bucket has available: this expense will not be saved */
  const overBalance =
    type === "e" &&
    amtNum > 0 &&
    remaining !== undefined &&
    amountBase > remaining + 0.005;
  // An edit that only lowers the amount (same bucket, same month) is always
  // allowed, even if the bucket is already below zero for another reason.
  const onlyLowers =
    Boolean(editing) &&
    editing!.type === "e" &&
    editing!.bucketId === bucketId &&
    toDateInputValue(editing!.date).slice(0, 7) === dateKey.slice(0, 7) &&
    amountBase <=
      amountInBase(editing!.amount, editing!.currency, baseCurrency, fx) + 0.005;
  const blockedHere = overBalance && !onlyLowers;
  /** What the bucket has available against what was asked for. Never suggests another bucket. */
  const shortfallText =
    blockedHere && selectedBucket
      ? remaining !== undefined && remaining > 0.005
        ? `${selectedBucket.name} has ${formatMoney(remaining, base)} available. That does not cover ${formatMoney(amountBase, base)}.`
        : `${selectedBucket.name} has nothing available. That does not cover ${formatMoney(amountBase, base)}.`
      : "";

  // What this income adds to each bucket: the plan is applied to the month's
  // total income, so the preview is (month with this income) − (month without).
  const incomePreview = useMemo(() => {
    if (type !== "i" || !plan || amtNum <= 0 || !inCurrentMonth) return null;
    let already = monthIncome;
    if (
      editing &&
      editing.type === "i" &&
      toDateInputValue(editing.date).slice(0, 7) === todayKey.slice(0, 7)
    ) {
      already -= amountInBase(editing.amount, editing.currency, baseCurrency, fx);
    }
    already = Math.max(0, already);
    const before = new Map(
      allocateWaterfall(already, plan).lines.map((l) => [l.bucketId, l.allocated])
    );
    return allocateWaterfall(already + amountBase, plan).lines.map((l) => ({
      bucketId: l.bucketId,
      name: l.name,
      emoji: l.emoji,
      added: l.allocated - (before.get(l.bucketId) || 0),
    }));
  }, [type, plan, amtNum, amountBase, inCurrentMonth, monthIncome, editing, todayKey, baseCurrency, fx]);

  const convHint =
    currency !== baseCurrency && amtNum > 0
      ? `≈ ${formatMoney(amountBase, base)} in ${baseCurrency}`
      : "";

  const editWindow = editing ? transactionLockState(editing.createdAt) : null;

  async function save(fundFrom?: { bucketId: string; reason: string }) {
    setError(null);
    setLoading(true);
    try {
      if (amtNum <= 0) throw new Error("Enter a valid amount");

      if (type === "e" && plan && !bucketId) {
        throw new Error("Pick a bucket for this expense.");
      }

      // Blocked at zero. An edit stops here. A NEW expense still goes to the
      // server, which answers with the shortfall and the buckets that could
      // fund it, so the user can approve an explicit exception.
      if (blockedHere && isEdit) {
        throw new Error(
          `${shortfallText} ${isEdit ? "Nothing was changed." : "Nothing was recorded."}`
        );
      }

      if (type === "e" && cross && !note.trim()) {
        throw new Error(
          "Cross-bucket spend blocked. Write a reason in the Note field, or choose a matching category."
        );
      }

      if (type === "i" && !isEdit && sources.length === 0) {
        throw new Error(
          "Add an income source first (Income tab). We don’t invent sources for you."
        );
      }

      if (type === "i" && !isEdit && !sourceId) {
        throw new Error("Pick an income source.");
      }

      const payload: Record<string, unknown> = {
        amount: amtNum,
        currency,
        note: note.trim() || null,
        date: dateKey || null,
        accountId: accountId || null,
      };
      if (!isEdit) payload.type = type;

      if (type === "i") {
        payload.sourceId = sourceId || null;
      } else {
        payload.bucketId = bucketId || null;
        payload.category = category || null;
        payload.reason = cross ? note.trim() : null;
      }

      if (fundFrom) payload.fundFrom = fundFrom;
      const res = await fetch(
        isEdit ? `/api/transactions/${editing!.id}` : "/api/transactions",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const data = await res.json();

      if (!data.ok) {
        // Refused because the bucket can not cover it: offer the explicit exception (new expenses only)
        if (data.blocked && data.shortfall?.options?.length > 0 && !isEdit) {
          setShortfall(data.shortfall as Shortfall);
          // Prefer a bucket that is not a protected, carry-over one
          setFundBucket((data.shortfall.options.find((o: { protected: boolean }) => !o.protected) ?? data.shortfall.options[0]).bucketId);
          setFundReason("");
          setFundConfirm(false);
        } else {
          setShortfall(null);
        }
        throw new Error(data.error || "Failed to save");
      }
      setShortfall(null);

      onClose();
      if (isEdit) {
        toast("Changes saved");
      } else {
        // Income is the one thing worth a little celebration; spending never is
        if (type === "i") celebrate();
        const days = streakAfterLoggingToday(streak);
        toast(days >= 2 ? `Transaction saved · logged ${days} days in a row` : "Transaction saved");
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  return {
    base, isEdit, type, setType, amount, setAmount, currency, setCurrency,
    sourceId, setSourceId, bucketId, setBucketId, category, setCategory,
    note, setNote, accountId, setAccountId, shortfall, fundBucket, setFundBucket,
    fundReason, setFundReason, fundConfirm, setFundConfirm, dateKey, setDateKey,
    todayKey, error, setError, loading, buckets, accountChoices, amtNum, amountBase,
    backdated, inCurrentMonth, selectedBucket, remaining, cross, blockedHere,
    shortfallText, incomePreview, convHint, editWindow, save,
    formatMoney: (n: number) => formatMoney(n, base),
  };
}
