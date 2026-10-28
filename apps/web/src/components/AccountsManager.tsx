"use client";

/**
 * Accounts screen: balances, adding / renaming / archiving, adjustments,
 * transfers between accounts, and the deliberate "assign existing transactions"
 * step. All rules live on the server; this only collects input and shows results.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ACCOUNT_TYPES, kindOfType, type CurrencyCode } from "@fintrack/domain";
import { formatExact as money } from "@/lib/money-format";
import { toDateInputValue } from "@/lib/format-date";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { InfoTip } from "@/components/ui/info-tip";
import { AccountTile } from "./accounts/AccountTile";
import type { AccountEvent, AccountView } from "@/lib/accounts";
import type { TransferView } from "@/lib/transfers";

const CURRENCIES: CurrencyCode[] = ["NGN", "USD", "GBP", "EUR"];

type Panel =
  | { mode: "add" }
  | { mode: "transfer" }
  | { mode: "rename" | "adjust"; account: AccountView }
  | null;

export function AccountsManager({
  accounts,
  transfers,
  unassignedCount,
  buckets,
}: {
  accounts: AccountView[];
  transfers: TransferView[];
  unassignedCount: number;
  /** Active plan buckets, for the bucket a transfer fee is spent from */
  buckets: { id: string; name: string; emoji: string }[];
}) {
  const router = useRouter();
  const today = toDateInputValue(new Date());
  const active = accounts.filter((a) => a.status === "active");
  const nameOf = (id: string) => accounts.find((a) => a.id === id)?.name ?? "Unknown account";

  const [panel, setPanel] = useState<Panel>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Add-account form
  const [name, setName] = useState("");
  const [type, setType] = useState<string>("bank");
  const [institution, setInstitution] = useState("");
  const [currency, setCurrency] = useState<CurrencyCode>("NGN");
  const [opening, setOpening] = useState("0");
  const [openingDate, setOpeningDate] = useState(today);
  // Rename / adjust
  const [text, setText] = useState("");
  // Transfer form
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [toAmount, setToAmount] = useState("");
  const [fee, setFee] = useState("");
  const [feeBucket, setFeeBucket] = useState(buckets.find((b) => b.id === "spend")?.id ?? buckets[0]?.id ?? "");
  const [tDate, setTDate] = useState(today);
  const [tNote, setTNote] = useState("");
  const [tRef, setTRef] = useState("");
  // Account history
  const [openId, setOpenId] = useState<string | null>(null);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [history, setHistory] = useState<AccountEvent[] | null>(null);
  // Assign existing transactions
  const [assignTo, setAssignTo] = useState<AccountView | null>(null);
  const [assignId, setAssignId] = useState("");

  async function call(url: string, method: string, body?: unknown): Promise<Record<string, unknown> | null> {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Something went wrong.");
      router.refresh();
      return data;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  const isDebt = kindOfType(type) === "liability";
  const fromAcc = active.find((a) => a.id === from);
  const toAcc = active.find((a) => a.id === to);
  const crossCurrency = Boolean(fromAcc && toAcc && fromAcc.currency !== toAcc.currency);

  async function addAccount(e: React.FormEvent) {
    e.preventDefault();
    const ok = await call("/api/accounts", "POST", {
      name,
      type,
      institution: institution.trim() || null,
      currency,
      openingBalance: Number(opening || 0),
      openingDate,
    });
    if (ok) {
      setName("");
      setInstitution("");
      setOpening("0");
      setPanel(null);
    }
  }

  async function savePanel(e: React.FormEvent) {
    e.preventDefault();
    if (!panel || (panel.mode !== "rename" && panel.mode !== "adjust")) return;
    const ok =
      panel.mode === "rename"
        ? await call(`/api/accounts/${panel.account.id}`, "PATCH", { name: text })
        : await call(`/api/accounts/${panel.account.id}/adjust`, "POST", {
            actualBalance: Number(text),
          });
    if (ok) {
      setPanel(null);
      setText("");
    }
  }

  async function sendTransfer(e: React.FormEvent) {
    e.preventDefault();
    const ok = await call("/api/transfers", "POST", {
      fromAccountId: from,
      toAccountId: to,
      amount: Number(amount),
      toAmount: crossCurrency ? Number(toAmount) : null,
      fee: fee ? Number(fee) : null,
      feeBucketId: fee && buckets.length > 0 ? feeBucket : null,
      date: tDate,
      note: tNote.trim() || null,
      reference: tRef.trim() || null,
    });
    if (ok) {
      setAmount("");
      setToAmount("");
      setFee("");
      setTNote("");
      setTRef("");
      setPanel(null);
    }
  }

  async function toggleHistory(id: string) {
    if (historyId === id) {
      setHistoryId(null);
      return;
    }
    setHistoryId(id);
    setHistory(null);
    const data = await call(`/api/accounts/${id}/history`, "GET");
    if (data) setHistory(data.events as AccountEvent[]);
  }

  async function confirmAssign() {
    if (!assignTo) return;
    const data = await call(`/api/accounts/${assignTo.id}/assign`, "POST", { confirm: true });
    if (data) {
      setNotice(
        `${data.assigned} transaction${data.assigned === 1 ? "" : "s"} assigned to ${assignTo.name}.` +
          (Number(data.skipped) > 0
            ? ` ${data.skipped} left unassigned (other currency, or dated before the account opened).`
            : "")
      );
      setAssignTo(null);
    }
  }

  // Totals by currency: what is held, and what is owed. Never mixed across currencies.
  const totals = new Map<string, { held: number; owed: number }>();
  for (const a of accounts.filter((x) => x.status !== "archived")) {
    const t = totals.get(a.currency) ?? { held: 0, owed: 0 };
    if (a.kind === "asset") t.held += a.balance;
    else t.owed += a.owed;
    totals.set(a.currency, t);
  }

  return (
    <>
      {totals.size > 0 && (
        <div className="card">
          <div className="card-t">
            Across your accounts
            <InfoTip label="About these balances">
              These are the balances you have recorded. They are not your net worth, and they are separate from your
              budget buckets.
            </InfoTip>
          </div>
          {[...totals].map(([ccy, t]) => (
            <p key={ccy} style={{ marginTop: 6 }}>
              <strong>{money(t.held, ccy)}</strong> held
              {t.owed > 0 && (
                <>
                  {" · "}
                  <strong>{money(t.owed, ccy)}</strong> owed
                </>
              )}
              <span className="muted"> ({ccy})</span>
            </p>
          ))}
        </div>
      )}

      {unassignedCount > 0 && active.length > 0 && (
        <div className="card" role="status">
          <strong className="flex items-center gap-2">
            {unassignedCount} transaction{unassignedCount === 1 ? " is" : "s are"} not assigned to any account.
            <InfoTip label="About unassigned transactions">
              They are not counted in any account balance. Nothing is assigned automatically: you choose, and you
              confirm.
            </InfoTip>
          </strong>
          <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            <select
              className="minp"
              aria-label="Account to assign them to"
              value={assignId}
              onChange={(e) => setAssignId(e.target.value)}
            >
              <option value="">Choose an account…</option>
              {active.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.currency})
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={!assignId}
              onClick={() => setAssignTo(active.find((a) => a.id === assignId) ?? null)}
            >
              Assign…
            </button>
          </div>
        </div>
      )}

      {notice && (
        <div className="card" role="status">
          {notice}
        </div>
      )}

      <div className="sec">Your accounts</div>
      {accounts.length === 0 && (
        <div className="card">
          <p>No accounts yet.</p>
          <p className="muted" style={{ marginTop: 4 }}>
            Add where your money is held, like a bank account, cash or a wallet,
            or a debt like a credit card. We never invent accounts or balances for you.
          </p>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {accounts.map((a) => (
          <AccountTile
            key={a.id}
            name={a.name}
            type={a.type}
            typeLabel={a.typeLabel}
            institution={a.institution}
            currency={a.currency}
            amountText={`${a.kind !== "liability" && a.balance < 0 ? "−" : ""}${money(a.kind === "liability" ? a.owed : a.balance, a.currency)}`}
            amountCaption={a.kind === "liability" ? "owed" : undefined}
            status={a.status}
            belowZero={a.belowZero}
            open={openId === a.id}
            onToggle={() => setOpenId(openId === a.id ? null : a.id)}
            controls={`account-${a.id}`}
          />
        ))}
      </div>
      {accounts.filter((a) => a.id === openId).map((a) => (
        <div className="card" id={`account-${a.id}`} key={a.id}>
          <div className="card-t">{a.name}</div>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              {a.belowZero && (
                <div className="error" role="status" style={{ marginTop: 6 }}>
                  This balance is below zero. A record may be missing: check your
                  transactions, or record an adjustment.
                </div>
              )}
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                Opened {a.openingDate} with {money(a.openingBalance, a.currency)}
                {a.kind === "liability" ? " owed" : ""} · {a.eventCount} recorded movement
                {a.eventCount === 1 ? "" : "s"}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {a.status === "active" && (
                <>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => {
                      setText(a.name);
                      setError(null);
                      setPanel({ mode: "rename", account: a });
                    }}
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => {
                      setText("");
                      setError(null);
                      setPanel({ mode: "adjust", account: a });
                    }}
                  >
                    Adjust balance
                  </button>
                </>
              )}
              <button
                type="button"
                className="btn btn-ghost"
                aria-expanded={historyId === a.id}
                onClick={() => void toggleHistory(a.id)}
              >
                {historyId === a.id ? "Hide history" : "History"}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={busy}
                onClick={() =>
                  void call(`/api/accounts/${a.id}`, "PATCH", {
                    status: a.status === "active" ? "archived" : "active",
                  })
                }
              >
                {a.status === "active" ? "Archive" : "Restore"}
              </button>
            </div>
          </div>

          {historyId === a.id && (
            <div style={{ marginTop: 12 }}>
              {history === null ? (
                <p className="muted">Loading…</p>
              ) : history.length === 0 ? (
                <p className="muted">Nothing has been recorded against this account yet.</p>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 480 }}>
                    <caption className="muted" style={{ textAlign: "left", fontSize: 12 }}>
                      Newest first. The balance is after each movement.
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col" style={{ textAlign: "left", padding: "4px 6px" }}>Date</th>
                        <th scope="col" style={{ textAlign: "left", padding: "4px 6px" }}>What</th>
                        <th scope="col" style={{ textAlign: "right", padding: "4px 6px" }}>Amount</th>
                        <th scope="col" style={{ textAlign: "right", padding: "4px 6px" }}>Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((e, i) => (
                        <tr key={i} style={{ borderTop: "1px solid var(--border, rgba(128,128,128,.2))" }}>
                          <td style={{ padding: "4px 6px", whiteSpace: "nowrap" }}>{e.date}</td>
                          <td style={{ padding: "4px 6px" }}>
                            {{
                              income: "Income",
                              expense: "Expense",
                              transfer_in: `Transfer in from ${e.counterparty ?? "another account"}`,
                              transfer_out: `Transfer out to ${e.counterparty ?? "another account"}`,
                              adjustment: "Balance adjustment",
                            }[e.kind]}
                            {e.note ? <span className="muted"> · {e.note}</span> : null}
                          </td>
                          <td style={{ padding: "4px 6px", textAlign: "right", whiteSpace: "nowrap" }}>
                            {e.amount < 0 ? "−" : "+"}
                            {money(e.amount, a.currency)}
                          </td>
                          <td style={{ padding: "4px 6px", textAlign: "right", whiteSpace: "nowrap" }}>
                            {e.balanceAfter < 0 ? "−" : ""}
                            {money(e.balanceAfter, a.currency)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {panel && (panel.mode === "rename" || panel.mode === "adjust") && panel.account.id === a.id && (
            <form onSubmit={savePanel} style={{ display: "grid", gap: 8, marginTop: 12 }}>
              {panel.mode === "rename" ? (
                <input
                  className="minp"
                  aria-label="New name"
                  value={text}
                  maxLength={60}
                  onChange={(e) => setText(e.target.value)}
                  required
                />
              ) : (
                <>
                  <input
                    className="minp"
                    type="number"
                    step="0.01"
                    inputMode="decimal"
                    aria-label={a.kind === "liability" ? "Amount actually owed" : "Actual balance"}
                    placeholder={a.kind === "liability" ? "What you really owe now" : "What the account really holds now"}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    required
                  />
                  <p className="muted" style={{ fontSize: 13 }}>
                    The difference is recorded as an adjustment. It is not income
                    and it is not spending.
                  </p>
                </>
              )}
              <div style={{ display: "flex", gap: 8 }}>
                <button type="submit" className="btn btn-primary" disabled={busy}>
                  {busy ? "Saving…" : "Save"}
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setPanel(null)} disabled={busy}>
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      ))}

      <div className="card" style={{ marginTop: 8 }}>
        {panel?.mode !== "add" ? (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="btn btn-primary" onClick={() => { setError(null); setPanel({ mode: "add" }); }}>
              + Add account
            </button>
            {active.length >= 2 && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setError(null);
                  setFrom(active[0].id);
                  setTo(active[1].id);
                  setPanel({ mode: "transfer" });
                }}
              >
                Transfer between accounts
              </button>
            )}
          </div>
        ) : (
          <form onSubmit={addAccount} style={{ display: "grid", gap: 8 }}>
            <div className="card-t">New account</div>
            <input className="minp" aria-label="Account name" placeholder="Name, e.g. GTBank Savings" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} required />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <select className="minp" aria-label="Account type" value={type} onChange={(e) => setType(e.target.value)}>
                {ACCOUNT_TYPES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
              <select className="minp" aria-label="Currency" value={currency} onChange={(e) => setCurrency(e.target.value as CurrencyCode)}>
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <input className="minp" aria-label="Institution" placeholder="Bank or provider (optional)" maxLength={80} value={institution} onChange={(e) => setInstitution(e.target.value)} />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input
                className="minp"
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                aria-label={isDebt ? "Amount owed now" : "Opening balance"}
                placeholder={isDebt ? "Amount you owe now" : "Opening balance"}
                value={opening}
                onChange={(e) => setOpening(e.target.value)}
              />
              <input className="minp" type="date" aria-label="Balance as of" max={today} value={openingDate} onChange={(e) => setOpeningDate(e.target.value)} />
            </div>
            <p className="muted" style={{ fontSize: 13 }}>
              {isDebt
                ? "Enter what you owe on this date. "
                : "Enter what it holds on this date. "}
              Only transactions on or after this date count toward the balance.
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {busy ? "Saving…" : "Save account"}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setPanel(null)} disabled={busy}>
                Cancel
              </button>
            </div>
          </form>
        )}

        {panel?.mode === "transfer" && (
          <form onSubmit={sendTransfer} style={{ display: "grid", gap: 8, marginTop: 12 }}>
            <div className="card-t">Transfer between your accounts</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <select className="minp" aria-label="From account" value={from} onChange={(e) => setFrom(e.target.value)}>
                {active.map((a) => (
                  <option key={a.id} value={a.id}>
                    From: {a.name} ({a.currency})
                  </option>
                ))}
              </select>
              <select className="minp" aria-label="To account" value={to} onChange={(e) => setTo(e.target.value)}>
                {active.map((a) => (
                  <option key={a.id} value={a.id}>
                    To: {a.name} ({a.currency})
                  </option>
                ))}
              </select>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input className="minp" type="number" min={0} step="0.01" inputMode="decimal" aria-label={`Amount sent${fromAcc ? ` (${fromAcc.currency})` : ""}`} placeholder={`Amount sent${fromAcc ? ` (${fromAcc.currency})` : ""}`} value={amount} onChange={(e) => setAmount(e.target.value)} required />
              {crossCurrency && toAcc && (
                <input className="minp" type="number" min={0} step="0.01" inputMode="decimal" aria-label={`Amount received (${toAcc.currency})`} placeholder={`Amount received (${toAcc.currency})`} value={toAmount} onChange={(e) => setToAmount(e.target.value)} required />
              )}
              <input className="minp" type="number" min={0} step="0.01" inputMode="decimal" aria-label="Fee (optional)" placeholder="Fee (optional)" value={fee} onChange={(e) => setFee(e.target.value)} />
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input className="minp" type="date" aria-label="Date" max={today} value={tDate} onChange={(e) => setTDate(e.target.value)} />
              <input className="minp" aria-label="Note" placeholder="Note (optional)" maxLength={500} value={tNote} onChange={(e) => setTNote(e.target.value)} />
              <input className="minp" aria-label="Reference" placeholder="Reference (optional)" maxLength={120} value={tRef} onChange={(e) => setTRef(e.target.value)} />
            </div>
            {Number(fee) > 0 && buckets.length > 0 && (
              <select
                className="minp"
                aria-label="Bucket the fee is spent from"
                value={feeBucket}
                onChange={(e) => setFeeBucket(e.target.value)}
              >
                {buckets.map((b) => (
                  <option key={b.id} value={b.id}>
                    Fee from: {b.emoji} {b.name}
                  </option>
                ))}
              </select>
            )}
            <p className="muted" style={{ fontSize: 13 }}>
              This only records that money moved. It is not income or spending,
              and nothing leaves FinTrack.
              {crossCurrency && " The accounts use different currencies, so enter what arrived: we never assume a conversion."}
              {fee
                ? " The fee is a real cost: it is recorded as an expense, taken from the sending account and from the bucket you choose."
                : ""}
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {busy ? "Saving…" : "Record transfer"}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setPanel(null)} disabled={busy}>
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

      {transfers.length > 0 && (
        <>
          <div className="sec">Recent transfers</div>
          {transfers.map((t) => (
            <div className="card" key={t.id}>
              <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <strong>
                    {nameOf(t.fromAccountId)} → {nameOf(t.toAccountId)}
                  </strong>
                  <div className="muted">
                    {t.date}
                    {t.note ? ` · ${t.note}` : ""}
                    {t.reference ? ` · ref ${t.reference}` : ""}
                  </div>
                  <div>
                    {money(t.fromAmount, accounts.find((a) => a.id === t.fromAccountId)?.currency ?? "NGN")} sent
                    {t.toAmount !== t.fromAmount || accounts.find((a) => a.id === t.fromAccountId)?.currency !== accounts.find((a) => a.id === t.toAccountId)?.currency
                      ? `, ${money(t.toAmount, accounts.find((a) => a.id === t.toAccountId)?.currency ?? "NGN")} received`
                      : ""}
                    {t.fee > 0 ? ` · fee ${money(t.fee, accounts.find((a) => a.id === t.fromAccountId)?.currency ?? "NGN")} (recorded as an expense)` : ""}
                  </div>
                </div>
                {!t.locked && (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={busy}
                    onClick={() => {
                      if (confirm("Delete this transfer? Both accounts go back to how they were.")) {
                        void call(`/api/transfers/${t.id}`, "DELETE");
                      }
                    }}
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </>
      )}

      <ConfirmDialog
        open={assignTo !== null}
        onOpenChange={(open) => {
          if (!open) setAssignTo(null);
        }}
        title={`Assign existing transactions to ${assignTo?.name ?? ""}?`}
        confirmLabel="Assign them"
        busyLabel="Assigning…"
        busy={busy}
        error={error}
        onConfirm={() => void confirmAssign()}
      >
        <p>
          This puts every unassigned transaction in {assignTo?.currency}, dated
          on or after {assignTo?.openingDate}, into this account, so they count
          toward its balance. Older ones stay out, because the opening balance
          already includes them.
        </p>
        <p style={{ marginTop: 8 }}>
          Only the account is set. Amounts, dates and buckets do not change. Do
          this only if that is really where that money was.
        </p>
      </ConfirmDialog>
    </>
  );
}
