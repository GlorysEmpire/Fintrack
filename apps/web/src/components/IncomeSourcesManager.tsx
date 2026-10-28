"use client";

/**
 * Add / delete income sources on the Income tab.
 * Empty list is valid — no auto-seed.
 */
import { useEffect, useState } from "react";
import { Check, Plus } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { celebrate } from "@/lib/confetti";
import { useLogSheet } from "./log/LogSheetProvider";
import { useRouter } from "next/navigation";
import { formatMoney, type CurrencyCode } from "@fintrack/domain";
import { GENERIC_INCOME_PRESETS } from "@/lib/income-presets";

type Source = {
  id: string;
  name: string;
  type: string;
  emoji: string;
  currency: string;
  amount: number;
  loggedBase: number;
};

const CURRENCIES: CurrencyCode[] = ["NGN", "USD", "GBP", "EUR"];

/** "Logged" with a check that pops in (off under reduced motion) */
function PaidChip({ amount }: { amount: string }) {
  const reduce = useReducedMotion();
  return (
    <span className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-primary/12 px-2.5 py-1 text-xs font-semibold text-primary">
      <motion.span
        className="flex"
        initial={reduce ? false : { scale: 0 }}
        animate={{ scale: 1 }}
        transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 18 }}
      >
        <Check className="h-3.5 w-3.5" aria-hidden />
      </motion.span>
      Logged {amount}
    </span>
  );
}

export function IncomeSourcesManager({
  sources,
  baseCurrency,
}: {
  sources: Source[];
  baseCurrency: string;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("💵");
  const [type, setType] = useState("other");
  const [currency, setCurrency] = useState<CurrencyCode>(
    (baseCurrency as CurrencyCode) || "NGN"
  );
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  async function addSource(payload: {
    name: string;
    type: string;
    emoji: string;
    currency: string;
    amount: number;
  }) {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Failed");
      setName("");
      setEmoji("💵");
      setAmount("");
      setShowForm(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  async function addCustom(e: React.FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n) {
      setError("Name is required");
      return;
    }
    await addSource({
      name: n,
      type,
      emoji: emoji.trim() || "💵",
      currency,
      amount: parseFloat(amount) || 0,
    });
  }

  async function addPreset(presetId: string) {
    const p = GENERIC_INCOME_PRESETS.find((x) => x.id === presetId);
    if (!p) return;
    if (sources.some((s) => s.name.toLowerCase() === p.name.toLowerCase())) {
      setError(`“${p.name}” is already on your list.`);
      return;
    }
    await addSource({
      name: p.name,
      type: p.type,
      emoji: p.emoji,
      currency: p.currency,
      amount: p.amount,
    });
  }

  async function removeSource(id: string) {
    if (!confirm("Remove this income source?")) return;
    setDeleting(id);
    setError(null);
    try {
      const res = await fetch(`/api/sources/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Failed");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setDeleting(null);
    }
  }

  const base = baseCurrency as CurrencyCode;
  const { open: openLog } = useLogSheet();

  // Every source has income logged this month: a small celebration, once per month
  const allLogged = sources.length > 0 && sources.every((s) => s.loggedBase > 0);
  useEffect(() => {
    if (!allLogged) return;
    const key = `ft-all-income-${new Date().toISOString().slice(0, 7)}`;
    try {
      if (window.localStorage.getItem(key)) return;
      window.localStorage.setItem(key, "1");
    } catch {
      return;
    }
    celebrate();
  }, [allLogged]);

  return (
    <>
      <div className="mb-2 mt-4 flex items-center justify-between">
        <div className="sec !m-0">Income sources</div>
        <button type="button" className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90" onClick={() => openLog({ type: "i" })}>
          <Plus className="h-4 w-4" aria-hidden /> Log income
        </button>
      </div>

      {sources.length === 0 && (
        <div className="card">
          <p>No income sources yet. Add one to label money when you log income.</p>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {sources.map((s) => (
          <div className="card !mb-0 flex items-center gap-3" key={s.id}>
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-xl" aria-hidden>
              {s.emoji}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">{s.name}</div>
              <div className="text-xs text-muted-foreground">
                {s.type} · expected {formatMoney(s.amount, s.currency as CurrencyCode)}/{s.currency}
              </div>
              {s.loggedBase > 0 ? (
                <PaidChip amount={formatMoney(s.loggedBase, base)} />
              ) : (
                <span className="mt-1.5 inline-block rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                  Not logged this month
                </span>
              )}
            </div>
            <button
              type="button"
              className="btn btn-ghost !mt-0 !w-auto px-3 text-xs"
              disabled={deleting === s.id}
              onClick={() => void removeSource(s.id)}
            >
              {deleting === s.id ? "…" : "Remove"}
            </button>
          </div>
        ))}
      </div>

      <div className="card" style={{ marginTop: 8 }}>
        <div className="card-t">Add source</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
          {GENERIC_INCOME_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className="btn btn-ghost"
              style={{ fontSize: 12, padding: "6px 10px" }}
              disabled={loading}
              onClick={() => void addPreset(p.id)}
            >
              {p.emoji} {p.name}
            </button>
          ))}
        </div>

        {!showForm ? (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setShowForm(true)}
          >
            + Custom source
          </button>
        ) : (
          <form onSubmit={addCustom} style={{ display: "grid", gap: 8 }}>
            <input
              className="minp"
              placeholder="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              disabled={loading}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <input
                className="minp"
                placeholder="💵"
                value={emoji}
                onChange={(e) => setEmoji(e.target.value)}
                style={{ width: 64 }}
                maxLength={4}
                disabled={loading}
              />
              <select
                className="minp"
                value={type}
                onChange={(e) => setType(e.target.value)}
                disabled={loading}
              >
                <option value="main">main</option>
                <option value="business">business</option>
                <option value="investment">investment</option>
                <option value="gift">gift</option>
                <option value="other">other</option>
              </select>
              <select
                className="minp"
                value={currency}
                onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
                disabled={loading}
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <input
              className="minp"
              type="number"
              min={0}
              step="any"
              placeholder="Expected monthly (optional)"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={loading}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={loading}
              >
                {loading ? "Saving…" : "Save source"}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setShowForm(false)}
                disabled={loading}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
        {error && (
          <div className="error" style={{ marginTop: 10 }}>
            {error}
          </div>
        )}
      </div>
    </>
  );
}
