"use client";

/**
 * Recurring income and expenses: add, pause, resume and delete rules.
 *
 * A rule only schedules. The daily job records the transactions, under the same
 * bucket rules as one typed in by hand, so an expense a bucket can not cover is
 * skipped and the Inbox says so.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatMoney, type CurrencyCode } from "@fintrack/domain";
import { toDateInputValue } from "@/lib/format-date";
import { ConfirmDialog } from "@/components/ConfirmDialog";

export type RecurringRuleRow = {
  id: string;
  type: "i" | "e";
  amount: number;
  currency: string;
  bucketId: string | null;
  sourceId: string | null;
  note: string | null;
  cadence: "daily" | "weekly" | "monthly";
  dayOfMonth: number | null;
  active: boolean;
  /** "YYYY-MM-DD" */
  nextDate: string;
  lastError: string | null;
};

type Option = { id: string; name: string; emoji: string };

const CURRENCIES: CurrencyCode[] = ["NGN", "USD", "GBP", "EUR"];

function ordinal(n: number): string {
  const rest = n % 100;
  if (rest >= 11 && rest <= 13) return `${n}th`;
  return `${n}${{ 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th"}`;
}

function cadenceLabel(rule: RecurringRuleRow): string {
  if (rule.cadence === "daily") return "Every day";
  if (rule.cadence === "weekly") return "Every week";
  return rule.dayOfMonth
    ? `Monthly on the ${ordinal(rule.dayOfMonth)}`
    : "Every month";
}

function prettyDay(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function RecurringManager({
  rules,
  buckets,
  sources,
  baseCurrency,
}: {
  rules: RecurringRuleRow[];
  buckets: Option[];
  sources: Option[];
  baseCurrency: string;
}) {
  const router = useRouter();
  const today = toDateInputValue(new Date());
  const [showForm, setShowForm] = useState(false);
  const [type, setType] = useState<"i" | "e">("e");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<CurrencyCode>(
    (baseCurrency as CurrencyCode) || "NGN"
  );
  const [bucketId, setBucketId] = useState(buckets[0]?.id ?? "");
  const [sourceId, setSourceId] = useState("");
  const [note, setNote] = useState("");
  const [cadence, setCadence] = useState<"daily" | "weekly" | "monthly">("monthly");
  const [dayOfMonth, setDayOfMonth] = useState("1");
  const [startDate, setStartDate] = useState(today);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<RecurringRuleRow | null>(null);
  /** The rule being changed; null = the form adds a new one */
  const [editing, setEditing] = useState<RecurringRuleRow | null>(null);

  function openNew() {
    setEditing(null);
    setError(null);
    setStartDate(today);
    setShowForm(true);
  }

  function openEdit(rule: RecurringRuleRow) {
    setEditing(rule);
    setError(null);
    setType(rule.type);
    setAmount(String(rule.amount));
    setCurrency(rule.currency as CurrencyCode);
    setBucketId(rule.bucketId ?? buckets[0]?.id ?? "");
    setSourceId(rule.sourceId ?? "");
    setNote(rule.note ?? "");
    setCadence(rule.cadence);
    setDayOfMonth(String(rule.dayOfMonth ?? 1));
    setStartDate("");
    setShowForm(true);
  }

  async function call(url: string, method: string, body?: unknown): Promise<boolean> {
    setError(null);
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Something went wrong.");
      router.refresh();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      return false;
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy("save");
    const day = cadence === "monthly" ? Number(dayOfMonth) : null;
    const ok = editing
      ? await call(`/api/recurring/${editing.id}`, "PATCH", {
          amount: Number(amount),
          currency,
          ...(editing.type === "e"
            ? { bucketId: bucketId || null }
            : { sourceId: sourceId || null }),
          note: note.trim() || null,
          // Only send the schedule when it changed: changing it restarts it from today
          ...(cadence !== editing.cadence ||
          day !== editing.dayOfMonth ||
          startDate
            ? { cadence, dayOfMonth: day, ...(startDate ? { startDate } : {}) }
            : {}),
        })
      : await call("/api/recurring", "POST", {
          type,
          amount: Number(amount),
          currency,
          bucketId: type === "e" ? bucketId || null : null,
          sourceId: type === "i" ? sourceId || null : null,
          note: note.trim() || null,
          cadence,
          dayOfMonth: day,
          startDate,
        });
    setBusy(null);
    if (ok) {
      setAmount("");
      setNote("");
      setEditing(null);
      setShowForm(false);
    }
  }

  async function toggle(rule: RecurringRuleRow) {
    setBusy(rule.id);
    await call(`/api/recurring/${rule.id}`, "PATCH", { active: !rule.active });
    setBusy(null);
  }

  async function confirmDelete() {
    if (!toDelete) return;
    setBusy(toDelete.id);
    const ok = await call(`/api/recurring/${toDelete.id}`, "DELETE");
    setBusy(null);
    if (ok) setToDelete(null);
  }

  const nameOf = (rule: RecurringRuleRow) => {
    const list = rule.type === "e" ? buckets : sources;
    const id = rule.type === "e" ? rule.bucketId : rule.sourceId;
    const found = list.find((o) => o.id === id);
    return found ? `${found.emoji} ${found.name}` : null;
  };

  return (
    <>
      <div className="sec">Recurring</div>
      <p className="sub">
        Rules that record income or an expense on a schedule. A rule never moves
        money: it only writes the record, and an expense a bucket can not cover
        is skipped (your Inbox tells you) instead of forced through.
      </p>

      {rules.length === 0 && (
        <div className="card">
          <p>No recurring rules yet.</p>
        </div>
      )}

      {rules.map((rule) => (
        <div className="card" key={rule.id} style={{ opacity: rule.active ? 1 : 0.7 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 180 }}>
              <strong>
                {rule.type === "i" ? "Income" : "Expense"}:{" "}
                {formatMoney(rule.amount, rule.currency as CurrencyCode)}
              </strong>
              {rule.note && <span> · {rule.note}</span>}
              <div className="muted">
                {cadenceLabel(rule)}
                {nameOf(rule) ? ` · ${nameOf(rule)}` : ""}
              </div>
              <div className="muted">
                {rule.active ? `Next: ${prettyDay(rule.nextDate)}` : "Paused"}
              </div>
              {rule.lastError && (
                <div className="error" role="status" style={{ marginTop: 6 }}>
                  {rule.lastError}
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={busy === rule.id}
                onClick={() => void toggle(rule)}
              >
                {rule.active ? "Pause" : "Resume"}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={busy === rule.id}
                onClick={() => openEdit(rule)}
              >
                Edit
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={busy === rule.id}
                onClick={() => setToDelete(rule)}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ))}

      <div className="card" style={{ marginTop: 8 }}>
        {!showForm ? (
          <button type="button" className="btn btn-primary" onClick={openNew}>
            + New recurring rule
          </button>
        ) : (
          <form onSubmit={save} style={{ display: "grid", gap: 8 }}>
            <div className="card-t">{editing ? "Change recurring rule" : "New recurring rule"}</div>
            <div style={{ display: "flex", gap: 8 }}>
              <select
                className="minp"
                aria-label="Income or expense"
                disabled={editing !== null}
                value={type}
                onChange={(e) => setType(e.target.value as "i" | "e")}
              >
                <option value="e">Expense</option>
                <option value="i">Income</option>
              </select>
              <input
                className="minp"
                type="number"
                min={0}
                step="any"
                inputMode="decimal"
                aria-label="Amount"
                placeholder="Amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
              <select
                className="minp"
                aria-label="Currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            {type === "e" && buckets.length > 0 && (
              <select
                className="minp"
                aria-label="Bucket"
                value={bucketId}
                onChange={(e) => setBucketId(e.target.value)}
              >
                {buckets.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.emoji} {b.name}
                  </option>
                ))}
              </select>
            )}
            {type === "i" && sources.length > 0 && (
              <select
                className="minp"
                aria-label="Income source"
                value={sourceId}
                onChange={(e) => setSourceId(e.target.value)}
              >
                <option value="">No source</option>
                {sources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.emoji} {s.name}
                  </option>
                ))}
              </select>
            )}

            <input
              className="minp"
              aria-label="Note"
              placeholder="Note (optional)"
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <select
                className="minp"
                aria-label="How often"
                value={cadence}
                onChange={(e) => setCadence(e.target.value as typeof cadence)}
              >
                <option value="daily">Every day</option>
                <option value="weekly">Every week</option>
                <option value="monthly">Every month</option>
              </select>
              {cadence === "monthly" && (
                <input
                  className="minp"
                  type="number"
                  min={1}
                  max={31}
                  aria-label="Day of the month"
                  value={dayOfMonth}
                  onChange={(e) => setDayOfMonth(e.target.value)}
                  style={{ width: 90 }}
                />
              )}
              <input
                className="minp"
                type="date"
                aria-label={editing ? "Restart from (optional)" : "Starts on"}
                min={today}
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <p className="muted" style={{ fontSize: 13 }}>
              In a month without that day it falls on the last day of the month.
              {editing &&
                " Changing how often it runs restarts it from today (or the date you pick)."}
            </p>

            <div style={{ display: "flex", gap: 8 }}>
              <button type="submit" className="btn btn-primary" disabled={busy === "save"}>
                {busy === "save" ? "Saving…" : "Save rule"}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setShowForm(false);
                  setEditing(null);
                }}
                disabled={busy === "save"}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
        {error && (
          <div className="error" role="alert" style={{ marginTop: 10 }}>
            {error}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => {
          if (!open) setToDelete(null);
        }}
        title="Delete this recurring rule?"
        confirmLabel="Delete rule"
        busyLabel="Deleting…"
        danger
        busy={busy === toDelete?.id}
        error={error}
        onConfirm={() => void confirmDelete()}
      >
        <p>
          It will stop recording new transactions. The ones it has already
          recorded stay in your history.
        </p>
      </ConfirmDialog>
    </>
  );
}
