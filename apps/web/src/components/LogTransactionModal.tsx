"use client";

/**
 * LOG TRANSACTION MODAL (Sprint 2)
 * - Income: amount, currency, source + live waterfall preview (if plan exists)
 * - Expense: amount, currency, bucket + soft friction (warn, never hard-block)
 *
 * Soft friction product rule:
 *   User can always spend their money.
 *   If over bucket / empty bucket → show warning, require reason + confirm checkbox.
 */
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  allocateWaterfall,
  amountInBase,
  formatMoney,
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
};

const CURRENCIES: CurrencyCode[] = ["NGN", "USD", "GBP", "EUR"];

export function LogTransactionModal({
  open,
  onClose,
  plan,
  sources,
  baseCurrency,
  fx,
}: Props) {
  const router = useRouter();
  const [type, setType] = useState<"i" | "e">("i");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<CurrencyCode>(
    (baseCurrency as CurrencyCode) || "NGN"
  );
  const [sourceId, setSourceId] = useState(sources[0]?.id || "");
  const [bucketId, setBucketId] = useState(plan?.buckets[0]?.id || "spend");
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [confirmOverride, setConfirmOverride] = useState(false);
  const [frictionMsg, setFrictionMsg] = useState<string | null>(null);
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Reset form when opened
  useEffect(() => {
    if (!open) return;
    setType("i");
    setAmount("");
    setCurrency((baseCurrency as CurrencyCode) || "NGN");
    setSourceId(sources[0]?.id || "");
    setBucketId(
      plan?.buckets.find((b) => b.id === "spend")?.id ||
        plan?.buckets[0]?.id ||
        ""
    );
    setNote("");
    setReason("");
    setConfirmOverride(false);
    setFrictionMsg(null);
    setNeedsConfirm(false);
    setError(null);
  }, [open, baseCurrency, sources, plan]);

  const amtNum = parseFloat(amount) || 0;

  /** Live income split preview in base currency */
  const incomePreview = useMemo(() => {
    if (type !== "i" || !plan || amtNum <= 0) return null;
    const base = amountInBase(amtNum, currency, baseCurrency, fx);
    return allocateWaterfall(base, plan);
  }, [type, plan, amtNum, currency, baseCurrency, fx]);

  const convHint =
    currency !== baseCurrency && amtNum > 0
      ? `≈ ${formatMoney(
          amountInBase(amtNum, currency, baseCurrency, fx),
          baseCurrency as CurrencyCode
        )} in ${baseCurrency}`
      : "";

  async function save(forceConfirm = false) {
    setError(null);
    setLoading(true);
    try {
      if (amtNum <= 0) throw new Error("Enter a valid amount");

      const payload: Record<string, unknown> = {
        type,
        amount: amtNum,
        currency,
        note: note.trim() || null,
      };

      if (type === "i") {
        payload.sourceId = sourceId || null;
      } else {
        payload.bucketId = bucketId || null;
        payload.reason = reason.trim() || null;
        payload.confirmOverride = forceConfirm || confirmOverride;
      }

      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      // Soft friction path — server asks for reason + confirm
      if (!data.ok && data.needsConfirm) {
        setNeedsConfirm(true);
        setFrictionMsg(data.friction?.message || data.error);
        setError(data.error || "Confirm this spend with a reason.");
        return;
      }

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

  const buckets = plan?.buckets.slice().sort((a, b) => a.order - b.order) || [];

  return (
    <div
      className="ov on"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal">
        <h2>Log transaction</h2>

        <div className="m-type-row">
          <button
            type="button"
            className={`mtbtn${type === "e" ? " exp" : ""}`}
            onClick={() => {
              setType("e");
              setNeedsConfirm(false);
              setFrictionMsg(null);
            }}
          >
            💸 Expense
          </button>
          <button
            type="button"
            className={`mtbtn${type === "i" ? " inc" : ""}`}
            onClick={() => {
              setType("i");
              setNeedsConfirm(false);
              setFrictionMsg(null);
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
            <div className="mlbl">Income source</div>
            <select
              className="minp"
              value={sourceId}
              onChange={(e) => setSourceId(e.target.value)}
            >
              {sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.emoji} {s.name}
                </option>
              ))}
              {sources.length === 0 && (
                <option value="">No sources — add in Settings</option>
              )}
            </select>

            {incomePreview && (
              <div className="modal-split">
                <div className="modal-split-t">
                  💧 This income will be split as
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

            {!plan && amtNum > 0 && (
              <p className="muted" style={{ marginTop: 10 }}>
                No plan yet — income still saves. Set a plan in Settings to
                auto-split into buckets.
              </p>
            )}
          </>
        )}

        {type === "e" && (
          <>
            <div className="mlbl">Draw from bucket</div>
            {buckets.length ? (
              <select
                className="minp"
                value={bucketId}
                onChange={(e) => {
                  setBucketId(e.target.value);
                  setNeedsConfirm(false);
                  setFrictionMsg(null);
                }}
              >
                {buckets.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.emoji} {b.name}
                  </option>
                ))}
              </select>
            ) : (
              <p className="muted">
                No plan buckets — expense still logs. Set a plan for tracking.
              </p>
            )}

            {frictionMsg && (
              <div className={`friction${needsConfirm ? " hard" : ""}`}>
                {frictionMsg}
                <div style={{ marginTop: 8, color: "var(--tx2)" }}>
                  We won&apos;t block you — it&apos;s your money. We will ask
                  you to own the decision.
                </div>
              </div>
            )}

            {(needsConfirm || frictionMsg) && (
              <>
                <div className="mlbl">Reason (required when over plan)</div>
                <input
                  className="minp"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. family emergency, intentional lifestyle choice…"
                />
                <label className="toggle-row" style={{ marginTop: 12 }}>
                  <input
                    type="checkbox"
                    checked={confirmOverride}
                    onChange={(e) => setConfirmOverride(e.target.checked)}
                  />
                  <div style={{ fontSize: 12 }}>
                    I understand this may go beyond my plan — save anyway
                  </div>
                </label>
              </>
            )}
          </>
        )}

        <div className="mlbl">Note (optional)</div>
        <input
          className="minp"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. client payment, DSTV, Uber…"
        />

        {error && <div className="error">{error}</div>}

        <button
          type="button"
          className="btn btn-primary"
          disabled={loading}
          onClick={() => save(false)}
          style={{ marginTop: 16 }}
        >
          {loading ? "Saving…" : "Save transaction"}
        </button>

        {needsConfirm && (
          <button
            type="button"
            className="btn btn-secondary"
            disabled={loading || !confirmOverride || !reason.trim()}
            onClick={() => save(true)}
          >
            Confirm &amp; save anyway
          </button>
        )}

        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}
