"use client";

/**
 * Log income or expense — or edit one that is still inside its edit window.
 *
 * Expense default. Category → bucket rules; cross-bucket needs Note.
 * Spending more than a bucket holds is never blocked: the server explains the
 * overspend, the user confirms, and it is saved as it happened.
 */
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  activeBuckets,
  allocateWaterfall,
  amountInBase,
  EDIT_WINDOW_RULE,
  editWindowRemainingLabel,
  EXPENSE_CATEGORIES,
  formatMoney,
  isCrossBucket,
  sortBucketsByPlanOrder,
  transactionLockState,
  BUCKET_DESCRIPTIONS,
  type BudgetPlan,
  type CurrencyCode,
} from "@fintrack/domain";
import { formatDay, formatMonthYear, toDateInputValue } from "@/lib/format-date";
import type { TxRow } from "@/lib/tx-row";
import { toast } from "@/components/ui/toast";

type Source = {
  id: string;
  name: string;
  emoji: string;
  currency: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  plan: BudgetPlan | null;
  sources: Source[];
  baseCurrency: string;
  fx: Record<string, number>;
  /** Optional live remaining by bucket id (base currency, this month) for warnings */
  bucketRemaining?: Record<string, number>;
  /** Income already logged this month (base currency), for the split preview */
  monthIncome?: number;
  /** Set to edit this transaction instead of logging a new one */
  editing?: TxRow | null;
};

/** What the server says when an expense is more than the bucket holds */
type OverspendWarning = {
  message: string;
  bucketName: string;
  overBy: number;
  remainingAfter: number;
};

const CURRENCIES: CurrencyCode[] = ["NGN", "USD", "GBP", "EUR"];

export function LogTransactionModal({
  open,
  onClose,
  plan,
  sources,
  baseCurrency,
  fx,
  bucketRemaining = {},
  monthIncome = 0,
  editing = null,
}: Props) {
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
  const [dateKey, setDateKey] = useState("");
  const [todayKey, setTodayKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  /** Set while the user is being asked to confirm an overspend */
  const [overspend, setOverspend] = useState<OverspendWarning | null>(null);

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
    setOverspend(null);

    if (editing) {
      setType(editing.type === "i" ? "i" : "e");
      setAmount(String(editing.amount));
      setCurrency(editing.currency as CurrencyCode);
      setSourceId(editing.sourceId || sources[0]?.id || "");
      setBucketId(editing.bucketId || "");
      setCategory(editing.category || "food");
      setNote(editing.note || "");
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
    setDateKey(today);
  }, [open, editing, base, sources, plan]);

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
  const overBalance =
    type === "e" &&
    amtNum > 0 &&
    remaining !== undefined &&
    amountBase > remaining + 0.005;

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

  async function save(confirmOverspend = false) {
    setError(null);
    setLoading(true);
    try {
      if (amtNum <= 0) throw new Error("Enter a valid amount");

      if (type === "e" && plan && !bucketId) {
        throw new Error("Pick a bucket for this expense.");
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
      };
      if (!isEdit) payload.type = type;

      if (type === "i") {
        payload.sourceId = sourceId || null;
      } else {
        payload.bucketId = bucketId || null;
        payload.category = category || null;
        payload.reason = cross ? note.trim() : null;
        // Only ever sent after the user has read the warning and agreed
        if (confirmOverspend) payload.confirmOverspend = true;
      }

      const res = await fetch(
        isEdit ? `/api/transactions/${editing!.id}` : "/api/transactions",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const data = await res.json();

      // More than the bucket holds: explain, and let the user decide.
      if (res.status === 409 && data.needsConfirmation && data.overspend) {
        setOverspend({
          message: data.error,
          bucketName: data.overspend.bucketName,
          overBy: data.overspend.overBy,
          remainingAfter: data.overspend.remainingAfter,
        });
        return;
      }

      if (!data.ok) throw new Error(data.error || "Failed to save");

      onClose();
      toast(
        data.overspend
          ? "Saved. This bucket is now overspent."
          : isEdit
            ? "Changes saved"
            : "Transaction saved"
      );
      router.refresh();
    } catch (e) {
      setOverspend(null);
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  const desc = BUCKET_DESCRIPTIONS[bucketId] || "";
  const title = isEdit ? "Edit transaction" : "Log transaction";

  // Render at <body> level so the overlay is above the entire app shell
  // (topbar + nav + scrollport) and free of any ancestor layout/stacking
  // interference on mobile.
  return createPortal(
    <div
      className="ov on"
      role="dialog"
      aria-modal="true"
      aria-labelledby="log-tx-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div className="modal glass-card">
        {overspend ? (
          <>
            <h2 id="log-tx-title">This is more than {overspend.bucketName} holds</h2>
            <div className="friction hard" role="alert">
              <strong>{overspend.message}</strong>
            </div>
            {!inCurrentMonth && dateKey && (
              <p className="muted" style={{ marginTop: 8 }}>
                Checked against {overspend.bucketName}&apos;s balance for{" "}
                {formatMonthYear(`${dateKey}T12:00:00.000Z`)}, the month you
                filed this under.
              </p>
            )}
            <div className="confirm-points">
              <p>
                <strong>What happens if you save it:</strong>
              </p>
              <ul>
                <li>
                  It is recorded exactly as you entered it, because it happened.
                  FinTrack never changes an amount to make a bucket fit.
                </li>
                <li>
                  {overspend.bucketName} will show{" "}
                  <strong>
                    {formatMoney(Math.max(0, -overspend.remainingAfter), base)} over
                  </strong>
                  , and the transaction is marked <em>overspent</em>.
                </li>
                <li>A note about it goes to your Inbox. Nothing else is changed.</li>
              </ul>
            </div>
            <button
              type="button"
              className="btn btn-danger"
              disabled={loading}
              onClick={() => save(true)}
              style={{ marginTop: 16 }}
            >
              {loading ? "Saving…" : "Yes, record it"}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={loading}
              onClick={() => setOverspend(null)}
            >
              Go back and change it
            </button>
          </>
        ) : (
          <>
            <h2 id="log-tx-title">{title}</h2>

            {isEdit ? (
              <p className="muted" style={{ marginBottom: 12 }}>
                {type === "i" ? "💵 Income" : "💸 Expense"}
                {editWindow && !editWindow.locked
                  ? ` · You can still change or delete this for ${editWindowRemainingLabel(
                      editWindow.msRemaining
                    )}.`
                  : ""}
              </p>
            ) : (
              <div className="m-type-row">
                <button
                  type="button"
                  className={`mtbtn${type === "e" ? " exp" : ""}`}
                  aria-pressed={type === "e"}
                  onClick={() => {
                    setType("e");
                    setError(null);
                  }}
                >
                  💸 Expense
                </button>
                <button
                  type="button"
                  className={`mtbtn${type === "i" ? " inc" : ""}`}
                  aria-pressed={type === "i"}
                  onClick={() => {
                    setType("i");
                    setError(null);
                  }}
                >
                  💵 Income
                </button>
              </div>
            )}

            <label className="mlbl" htmlFor="tx-amount">
              Amount
            </label>
            <div className="mr2">
              <input
                id="tx-amount"
                className="minp"
                type="number"
                name="amount"
                min="0"
                step="any"
                inputMode="decimal"
                placeholder="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                style={{ flex: 2 }}
                autoFocus
              />
              <select
                className="minp"
                aria-label="Currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
                style={{ flex: 1 }}
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="mconv">{convHint}</div>

            <label className="mlbl" htmlFor="tx-date">
              Date{" "}
              <span className="mlbl-hint">(when it happened)</span>
            </label>
            <input
              id="tx-date"
              className="minp"
              type="date"
              name="date"
              value={dateKey}
              min="2000-01-01"
              max={todayKey || undefined}
              onChange={(e) => {
                setDateKey(e.target.value);
                setError(null);
              }}
            />
            <div className="mconv">
              {backdated && dateKey
                ? `Filed under ${formatDay(`${dateKey}T12:00:00.000Z`)}. Its month is recalculated to include it.`
                : ""}
            </div>

            {type === "i" && (
              <>
                {sources.length === 0 ? (
                  <div
                    className="card"
                    style={{
                      marginTop: 8,
                      marginBottom: 8,
                      padding: 12,
                    }}
                  >
                    <p style={{ marginBottom: 10, fontSize: 14, lineHeight: 1.45 }}>
                      You don&apos;t have any income sources yet. Add one before
                      logging income — we never invent defaults for you.
                    </p>
                    <Link
                      href="/income"
                      className="btn btn-primary"
                      style={{ display: "inline-block" }}
                      onClick={onClose}
                    >
                      Add income source →
                    </Link>
                  </div>
                ) : (
                  <>
                    <label className="mlbl" htmlFor="tx-source">
                      Income source
                    </label>
                    <select
                      id="tx-source"
                      className="minp"
                      value={sourceId}
                      onChange={(e) => setSourceId(e.target.value)}
                      required
                    >
                      {sources.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.emoji} {s.name}
                        </option>
                      ))}
                    </select>
                  </>
                )}

                {incomePreview && (sources.length > 0 || isEdit) && (
                  <div className="modal-split" style={{ display: "block" }}>
                    <div className="modal-split-t">
                      This income adds to your buckets this month
                    </div>
                    <div className="modal-split-grid">
                      {incomePreview.map((l) => (
                        <div className="ms-item" key={l.bucketId}>
                          <div className="ms-lbl">
                            {l.emoji} {l.name}
                          </div>
                          <div className="ms-val" style={{ color: "var(--g)" }}>
                            +{formatMoney(l.added, base)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {plan && amtNum > 0 && !inCurrentMonth && (
                  <p className="muted" style={{ marginTop: 10 }}>
                    This income is split by your plan in the month it is filed
                    under, and buckets that carry over are updated from there.
                  </p>
                )}

                {!plan && amtNum > 0 && sources.length > 0 && (
                  <p className="muted" style={{ marginTop: 10 }}>
                    No plan yet. Income still saves. Set a plan in Settings to
                    auto-split into buckets.
                  </p>
                )}
              </>
            )}

            {type === "e" && (
              <>
                <label className="mlbl" htmlFor="tx-bucket">
                  Draw from bucket{" "}
                  <span className="mlbl-hint">
                    (which allocation you are spending from)
                  </span>
                </label>
                {buckets.length ? (
                  <select
                    id="tx-bucket"
                    className="minp"
                    value={bucketId}
                    onChange={(e) => {
                      setBucketId(e.target.value);
                      setError(null);
                    }}
                  >
                    {buckets.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.emoji} {b.name}
                        {b.archived ? " (archived)" : ""}
                        {!b.archived && inCurrentMonth && bucketRemaining[b.id] !== undefined
                          ? bucketRemaining[b.id] < -0.005
                            ? ` · ${formatMoney(-bucketRemaining[b.id], base)} over`
                            : ` · ${formatMoney(Math.max(0, bucketRemaining[b.id]), base)} left`
                          : ""}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="muted">
                    No plan buckets. Expense still logs. Set a plan for tracking.
                  </p>
                )}

                <label className="mlbl" htmlFor="tx-category">
                  Spent on
                </label>
                <select
                  id="tx-category"
                  className="minp"
                  value={category}
                  onChange={(e) => {
                    setCategory(e.target.value);
                    setError(null);
                  }}
                >
                  {EXPENSE_CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>

                {/* Cross-bucket / remaining notice (always visible when expense + bucket) */}
                {bucketId && selectedBucket && (
                  <div
                    role="status"
                    className="bucket-warning"
                    style={{
                      display: "block",
                      marginTop: 8,
                      padding: "10px 12px",
                      borderRadius: 8,
                      fontSize: 12,
                      lineHeight: 1.55,
                      background: cross
                        ? "var(--rdim)"
                        : overBalance
                          ? "var(--ydim)"
                          : "var(--gdim)",
                      border: cross
                        ? "1px solid color-mix(in oklch, var(--r) 40%, transparent)"
                        : overBalance
                          ? "1px solid color-mix(in oklch, var(--y) 45%, transparent)"
                          : "1px solid var(--g)",
                      color: cross ? "var(--r)" : overBalance ? "var(--y)" : "var(--g)",
                    }}
                  >
                    {cross ? (
                      <>
                        <strong>Cross-bucket:</strong> this category does not match{" "}
                        <strong>{selectedBucket.name}</strong>
                        . {desc ? `${desc}. ` : ""}
                        {remaining !== undefined && (
                          <>
                            Remaining:{" "}
                            <strong>{formatMoney(Math.max(0, remaining), base)}</strong>
                            .{" "}
                          </>
                        )}
                        <strong>Write a reason in the Note field to save.</strong>
                      </>
                    ) : overBalance ? (
                      <>
                        <strong>More than this bucket holds.</strong>{" "}
                        {remaining !== undefined && remaining <= 0.005
                          ? `${selectedBucket.name} has nothing left this month.`
                          : `Only ${formatMoney(Math.max(0, remaining || 0), base)} is left in ${selectedBucket.name}.`}{" "}
                        You can still record it: FinTrack will explain the
                        overspend and ask you to confirm.
                      </>
                    ) : (
                      <>
                        <strong>
                          {selectedBucket.emoji} {selectedBucket.name}
                        </strong>
                        {desc ? ` · ${desc}` : ""}
                        {remaining !== undefined && (
                          <>
                            <br />
                            Remaining this month:{" "}
                            <strong>{formatMoney(Math.max(0, remaining), base)}</strong>
                          </>
                        )}
                        {!inCurrentMonth && (
                          <>
                            <br />
                            This is checked against the bucket&apos;s balance in
                            the month you picked when you save.
                          </>
                        )}
                      </>
                    )}
                  </div>
                )}
              </>
            )}

            <label className="mlbl" htmlFor="tx-note">
              Note{" "}
              <span
                className="mlbl-hint"
                style={cross ? { color: "var(--r)" } : undefined}
              >
                {cross ? "(required for cross-bucket)" : "(optional)"}
              </span>
            </label>
            <input
              id="tx-note"
              className="minp"
              value={note}
              maxLength={500}
              onChange={(e) => setNote(e.target.value)}
              placeholder={
                cross
                  ? "Why are you drawing from this bucket?"
                  : "e.g. client payment, DSTV, Uber"
              }
            />

            {!isEdit && <p className="edit-rule">{EDIT_WINDOW_RULE}</p>}

            {error && (
              <div className="error" role="alert">
                {error}
              </div>
            )}

            <button
              type="button"
              className="btn btn-primary"
              disabled={loading || (type === "i" && !isEdit && sources.length === 0)}
              onClick={() => save()}
              style={{ marginTop: 16 }}
            >
              {loading
                ? "Saving…"
                : type === "i" && !isEdit && sources.length === 0
                  ? "Add a source first"
                  : isEdit
                    ? "Save changes"
                    : "Save transaction"}
            </button>

            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
