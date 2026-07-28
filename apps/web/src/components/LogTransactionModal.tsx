"use client";

/**
 * Log income or expense.
 * Expense default. Category → bucket rules; cross-bucket needs Note.
 * Hard-blocks when amount exceeds bucket remaining.
 */
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  allocateWaterfall,
  amountInBase,
  EXPENSE_CATEGORIES,
  formatMoney,
  isCrossBucket,
  sortBucketsByCanonicalOrder,
  BUCKET_DESCRIPTIONS,
  type BudgetPlan,
  type CurrencyCode,
} from "@fintrack/domain";

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
  /** Optional live remaining by bucket id (base currency) for warnings */
  bucketRemaining?: Record<string, number>;
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
}: Props) {
  const router = useRouter();
  const [type, setType] = useState<"i" | "e">("e");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<CurrencyCode>(
    (baseCurrency as CurrencyCode) || "NGN"
  );
  const [sourceId, setSourceId] = useState(sources[0]?.id || "");
  const [bucketId, setBucketId] = useState("spend");
  const [category, setCategory] = useState("food");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const buckets = useMemo(
    () =>
      plan
        ? sortBucketsByCanonicalOrder(plan.buckets)
        : [],
    [plan]
  );

  // Reset form when opened (default Expense)
  useEffect(() => {
    if (!open) return;
    setType("e");
    setAmount("");
    setCurrency((baseCurrency as CurrencyCode) || "NGN");
    setSourceId(sources[0]?.id || "");
    setBucketId(
      plan?.buckets.find((b) => b.id === "spend")?.id ||
        sortBucketsByCanonicalOrder(plan?.buckets || [])[0]?.id ||
        "spend"
    );
    setCategory("food");
    setNote("");
    setError(null);
  }, [open, baseCurrency, sources, plan]);

  const amtNum = parseFloat(amount) || 0;
  const amountBase = amountInBase(amtNum, currency, baseCurrency, fx);
  const remaining =
    bucketId in bucketRemaining
      ? bucketRemaining[bucketId]
      : undefined;
  const cross =
    type === "e" && bucketId && category
      ? isCrossBucket(bucketId, category)
      : false;
  const overBalance =
    type === "e" &&
    remaining !== undefined &&
    (remaining <= 0 || amountBase > remaining + 1e-9);

  const incomePreview = useMemo(() => {
    if (type !== "i" || !plan || amtNum <= 0) return null;
    const base = amountInBase(amtNum, currency, baseCurrency, fx);
    return allocateWaterfall(base, plan);
  }, [type, plan, amtNum, currency, baseCurrency, fx]);

  const convHint =
    currency !== baseCurrency && amtNum > 0
      ? `≈ ${formatMoney(
          amountBase,
          baseCurrency as CurrencyCode
        )} in ${baseCurrency}`
      : "";

  async function save() {
    setError(null);
    setLoading(true);
    try {
      if (amtNum <= 0) throw new Error("Enter a valid amount");

      if (type === "e" && plan && !bucketId) {
        throw new Error("Pick a bucket for this expense.");
      }

      if (type === "e" && overBalance) {
        throw new Error(
          remaining !== undefined && remaining <= 0
            ? "This bucket has no remaining balance. Log income first or choose another bucket."
            : `Blocked: amount exceeds remaining balance (${formatMoney(
                Math.max(0, remaining || 0),
                baseCurrency as CurrencyCode
              )} left).`
        );
      }

      if (type === "e" && cross && !note.trim()) {
        throw new Error(
          "Cross-bucket spend blocked. Write a reason in the Note field, or choose a matching category."
        );
      }

      if (type === "i" && sources.length === 0) {
        throw new Error(
          "Add an income source first (Income tab). We don’t invent sources for you."
        );
      }

      if (type === "i" && !sourceId) {
        throw new Error("Pick an income source.");
      }

      const payload: Record<string, unknown> = {
        type,
        amount: amtNum,
        currency,
        note: note.trim() || null,
      };

      if (type === "i") {
        payload.sourceId = sourceId;
      } else {
        payload.bucketId = bucketId || null;
        payload.category = category || null;
        if (cross) {
          payload.reason = note.trim();
        }
      }

      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!data.ok) throw new Error(data.error || "Failed to save");

      onClose();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  const desc = BUCKET_DESCRIPTIONS[bucketId] || "";

  return (
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
        <h2 id="log-tx-title">Log transaction</h2>

        <div className="m-type-row">
          <button
            type="button"
            className={`mtbtn${type === "e" ? " exp" : ""}`}
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
            onClick={() => {
              setType("i");
              setError(null);
            }}
          >
            💵 Income
          </button>
        </div>

        <div className="mlbl">Amount</div>
        <div className="mr2">
          <input
            className="minp"
            type="number"
            min="0"
            step="any"
            placeholder="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            style={{ flex: 2 }}
            autoFocus
          />
          <select
            className="minp"
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
                <div className="mlbl">Income source</div>
                <select
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

            {incomePreview && sources.length > 0 && (
              <div className="modal-split" style={{ display: "block" }}>
                <div className="modal-split-t">
                  This income will be split as
                </div>
                <div className="modal-split-grid">
                  {incomePreview.lines.map((l) => (
                    <div className="ms-item" key={l.bucketId}>
                      <div className="ms-lbl">
                        {l.emoji} {l.name}
                      </div>
                      <div className="ms-val" style={{ color: "var(--g)" }}>
                        {formatMoney(
                          l.allocated,
                          baseCurrency as CurrencyCode
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
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
            <div className="mlbl">
              Draw from bucket{" "}
              <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, color: "var(--tx3)", fontSize: 10 }}>
                (which allocation you are spending from)
              </span>
            </div>
            {buckets.length ? (
              <select
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
                    {bucketRemaining[b.id] !== undefined
                      ? ` · ${formatMoney(Math.max(0, bucketRemaining[b.id]), baseCurrency as CurrencyCode)} left`
                      : ""}
                  </option>
                ))}
              </select>
            ) : (
              <p className="muted">
                No plan buckets. Expense still logs. Set a plan for tracking.
              </p>
            )}

            <div className="mlbl">Spent on</div>
            <select
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

            {/* Cross-bucket / remaining warning (always visible when expense + bucket) */}
            {bucketId && (
              <div
                role="alert"
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
                      ? "var(--rdim)"
                      : "var(--gdim)",
                  border: cross || overBalance
                    ? "1px solid color-mix(in oklch, var(--r) 40%, transparent)"
                    : "1px solid var(--g)",
                  color: cross || overBalance ? "var(--r)" : "var(--g)",
                }}
              >
                {cross ? (
                  <>
                    <strong>Cross-bucket:</strong> this category does not match{" "}
                    <strong>{buckets.find((b) => b.id === bucketId)?.name || bucketId}</strong>
                    . {desc ? `${desc}. ` : ""}
                    {remaining !== undefined && (
                      <>
                        Remaining:{" "}
                        <strong>
                          {formatMoney(
                            Math.max(0, remaining),
                            baseCurrency as CurrencyCode
                          )}
                        </strong>
                        .{" "}
                      </>
                    )}
                    <strong>Write a reason in the Note field to save.</strong>
                  </>
                ) : overBalance ? (
                  <>
                    <strong>Insufficient balance.</strong>{" "}
                    {remaining !== undefined && remaining <= 0
                      ? "This bucket is empty this month."
                      : `Only ${formatMoney(
                          Math.max(0, remaining || 0),
                          baseCurrency as CurrencyCode
                        )} remains.`}{" "}
                    Reduce the amount, pick another bucket, or log income first.
                  </>
                ) : (
                  <>
                    <strong>
                      {buckets.find((b) => b.id === bucketId)?.emoji}{" "}
                      {buckets.find((b) => b.id === bucketId)?.name}
                    </strong>
                    {desc ? ` · ${desc}` : ""}
                    {remaining !== undefined && (
                      <>
                        <br />
                        Remaining this month:{" "}
                        <strong>
                          {formatMoney(
                            Math.max(0, remaining),
                            baseCurrency as CurrencyCode
                          )}
                        </strong>
                      </>
                    )}
                  </>
                )}
              </div>
            )}
          </>
        )}

        <div className="mlbl">
          Note{" "}
          <span
            style={{
              fontWeight: 400,
              textTransform: "none",
              letterSpacing: 0,
              color: cross ? "var(--r)" : "var(--tx3)",
              fontSize: 10,
            }}
          >
            {cross ? "(required for cross-bucket)" : "(optional)"}
          </span>
        </div>
        <input
          className="minp"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={
            cross
              ? "Why are you drawing from this bucket?"
              : "e.g. client payment, DSTV, Uber"
          }
        />

        {error && <div className="error">{error}</div>}

        <button
          type="button"
          className="btn btn-primary"
          disabled={loading || (type === "i" && sources.length === 0)}
          onClick={() => save()}
          style={{ marginTop: 16 }}
        >
          {loading
            ? "Saving…"
            : type === "i" && sources.length === 0
              ? "Add a source first"
              : "Save transaction"}
        </button>

        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}
