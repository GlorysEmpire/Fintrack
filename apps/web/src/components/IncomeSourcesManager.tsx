"use client";

/**
 * Add / delete income sources on the Income tab.
 * Empty list is valid — no auto-seed.
 */
import { useState } from "react";
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

  return (
    <>
      <div className="sec">Income sources</div>

      {sources.length === 0 && (
        <div className="card" style={{ marginBottom: 12 }}>
          <p style={{ marginBottom: 8 }}>
            No income sources yet. Add one to label money when you log income.
          </p>
          <p className="muted" style={{ fontSize: 13 }}>
            Empty is valid — we never invent sources for you.
          </p>
        </div>
      )}

      {sources.map((s) => (
        <div className="card" key={s.id}>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <div style={{ fontSize: 22 }}>{s.emoji}</div>
            <div style={{ flex: 1 }}>
              <strong>{s.name}</strong>
              <div className="muted">
                {s.type} · expected{" "}
                {formatMoney(s.amount, s.currency as CurrencyCode)}/{s.currency}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ color: "var(--g)", fontWeight: 700 }}>
                {formatMoney(s.loggedBase, base)}
              </div>
              <div className="muted" style={{ fontWeight: 400, fontSize: 12 }}>
                logged
              </div>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ marginTop: 6, fontSize: 12, padding: "4px 8px" }}
                disabled={deleting === s.id}
                onClick={() => void removeSource(s.id)}
              >
                {deleting === s.id ? "…" : "Remove"}
              </button>
            </div>
          </div>
        </div>
      ))}

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
