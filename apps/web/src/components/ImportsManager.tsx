"use client";

/**
 * Bank connections and the review queue. All rules live on the server; this
 * collects choices and shows results.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatMoney } from "@fintrack/domain";
import { formatExact } from "@/lib/money-format";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import type { ConnectionView } from "@/lib/bank/connections";
import type { ImportView } from "@/lib/bank/review";

type Option = { id: string; name: string; emoji?: string; currency?: string };

const STATUS_TEXT: Record<string, string> = {
  active: "Connected",
  error: "Stopped after repeated failures",
  expired: "The bank no longer allows access",
  revoked: "Disconnected",
};

export function ImportsManager({
  connections,
  imports,
  providers,
  accounts,
  buckets,
}: {
  connections: ConnectionView[];
  imports: ImportView[];
  providers: { id: string; label: string }[];
  accounts: Option[];
  buckets: Option[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<{ scope: string; text: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [toDisconnect, setToDisconnect] = useState<ConnectionView | null>(null);
  const [linking, setLinking] = useState<{ connectionId: string; offered: { externalId: string; name: string; currency: string }[] } | null>(null);
  const [externalId, setExternalId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [bucketFor, setBucketFor] = useState<Record<string, string>>({});
  // A bank transaction bigger than its bucket: the user may approve funding the shortfall from another bucket
  const [exception, setException] = useState<{
    importId: string;
    short: number;
    options: { bucketId: string; name: string; available: number; protected: boolean }[];
  } | null>(null);
  const [fundBucket, setFundBucket] = useState("");
  const [fundReason, setFundReason] = useState("");
  const [fundConfirm, setFundConfirm] = useState(false);

  async function call(scope: string, url: string, method: string, body?: unknown): Promise<Record<string, unknown> | null> {
    setError(null);
    setNotice(null);
    setBusy(scope);
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
      setError({ scope, text: e instanceof Error ? e.message : "Something went wrong." });
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function accept(importId: string, fundFrom?: { bucketId: string; reason: string }) {
    setError(null);
    setNotice(null);
    setBusy(importId);
    try {
      const res = await fetch(`/api/bank/imports/${importId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "accept", bucketId: bucketFor[importId] || null, ...(fundFrom ? { fundFrom } : {}) }),
      });
      const data = await res.json();
      if (!data.ok) {
        if (data.blocked && data.shortfall?.options?.length > 0) {
          setException({ importId, short: data.shortfall.short, options: data.shortfall.options });
          setFundBucket((data.shortfall.options.find((o: { protected: boolean }) => !o.protected) ?? data.shortfall.options[0]).bucketId);
          setFundReason("");
          setFundConfirm(false);
        } else {
          setException(null);
        }
        throw new Error(data.error || "Something went wrong.");
      }
      setException(null);
      router.refresh();
    } catch (e) {
      setError({ scope: importId, text: e instanceof Error ? e.message : "Something went wrong." });
    } finally {
      setBusy(null);
    }
  }

  async function openLink(connectionId: string) {
    const data = await call(connectionId, `/api/bank/connections/${connectionId}`, "POST", { action: "accounts" });
    if (data) {
      const offered = data.accounts as { externalId: string; name: string; currency: string }[];
      setLinking({ connectionId, offered });
      setExternalId(offered[0]?.externalId ?? "");
      setAccountId("");
    }
  }

  async function sync(connectionId: string) {
    const data = await call(connectionId, `/api/bank/connections/${connectionId}`, "POST", { action: "sync" });
    if (data) setNotice(`${data.imported} new, ${data.updated} updated${Number(data.flagged) > 0 ? `, ${data.flagged} changed by the bank` : ""}.`);
  }

  const chosenExternal = linking?.offered.find((o) => o.externalId === externalId);
  const matching = accounts.filter((a) => !chosenExternal || a.currency === chosenExternal.currency);

  return (
    <>
      <div className="sec">Connections</div>
      {connections.length === 0 && (
        <div className="card">
          <p>No bank connected.</p>
          {providers.length === 0 && (
            <p className="muted" style={{ marginTop: 4 }}>
              No bank provider is available yet. Real bank connections need a provider agreement first; until
              then you keep recording transactions by hand.
            </p>
          )}
        </div>
      )}

      {connections.map((c) => (
        <div className="card" key={c.id}>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <strong>{c.provider === "mock" ? "Demo bank" : c.provider}</strong>
              <div className="muted">
                {STATUS_TEXT[c.status] ?? c.status}
                {c.lastSuccessAt ? ` · last synced ${new Date(c.lastSuccessAt).toLocaleString("en-GB", { timeZone: "Africa/Lagos" })}` : " · not synced yet"}
              </div>
              {c.lastError && <div className="error" role="status" style={{ marginTop: 6 }}>{c.lastError}</div>}
              <div className="muted" style={{ marginTop: 4 }}>
                {c.linkedAccounts.length === 0
                  ? "No account linked yet."
                  : `Linked: ${c.linkedAccounts.map((a) => a.name).join(", ")}`}
                {c.pendingReview > 0 ? ` · ${c.pendingReview} to review` : ""}
              </div>
            </div>
            {c.status === "active" && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button type="button" className="btn btn-ghost" disabled={busy === c.id} onClick={() => void openLink(c.id)}>
                  Link an account
                </button>
                <button type="button" className="btn btn-ghost" disabled={busy === c.id || c.linkedAccounts.length === 0} onClick={() => void sync(c.id)}>
                  {busy === c.id ? "Working…" : "Sync now"}
                </button>
              </div>
            )}
            {c.status !== "revoked" && (
              <button type="button" className="btn btn-ghost" disabled={busy === c.id} onClick={() => setToDisconnect(c)}>
                Disconnect
              </button>
            )}
          </div>

          {linking?.connectionId === c.id && (
            <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
              <select className="minp" aria-label="Bank account" value={externalId} onChange={(e) => setExternalId(e.target.value)}>
                {linking.offered.map((o) => (
                  <option key={o.externalId} value={o.externalId}>
                    {o.name} ({o.currency})
                  </option>
                ))}
              </select>
              <select className="minp" aria-label="FinTrack account to link it to" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                <option value="">Choose one of your accounts…</option>
                {matching.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.currency})
                  </option>
                ))}
              </select>
              <p className="muted" style={{ fontSize: 13 }}>
                Only transactions from this bank account will be read, and only into your review queue.
              </p>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!accountId || !externalId || busy === c.id}
                  onClick={async () => {
                    const ok = await call(c.id, `/api/bank/connections/${c.id}`, "POST", { action: "link", externalAccountId: externalId, accountId });
                    if (ok) setLinking(null);
                  }}
                >
                  Link
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setLinking(null)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
          {error?.scope === c.id && <div className="error" role="alert" style={{ marginTop: 10 }}>{error.text}</div>}
        </div>
      ))}

      {providers.map((p) => (
        <div className="card" key={p.id}>
          <button type="button" className="btn btn-primary" disabled={busy === "connect"} onClick={() => void call("connect", "/api/bank/connections", "POST", { provider: p.id })}>
            + Connect: {p.label}
          </button>
          {error?.scope === "connect" && <div className="error" role="alert" style={{ marginTop: 10 }}>{error.text}</div>}
        </div>
      ))}

      {notice && <div className="card" role="status">{notice}</div>}

      <div className="sec">To review</div>
      {imports.length === 0 ? (
        <div className="card">
          <p>Nothing waiting for you.</p>
        </div>
      ) : (
        imports.map((i) => {
          const credit = i.amount >= 0;
          return (
            <div className="card" key={i.id}>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <strong>{i.counterparty || i.description || "Bank transaction"}</strong>
                  <div className="muted">
                    {i.date} · {i.accountName}
                    {i.description && i.counterparty ? ` · ${i.description}` : ""}
                  </div>
                  {i.status === "pending" && <div className="muted">Waiting for the bank to post it. You can record it once it has.</div>}
                  {i.status === "reversed" && <div className="muted">The bank reversed this one.</div>}
                  {i.attention && (
                    <div className="error" role="status" style={{ marginTop: 6 }}>
                      {i.attention} Your recorded transaction was not changed.{" "}
                      <button type="button" className="btn btn-ghost" style={{ padding: "2px 8px" }} onClick={() => void call(i.id, `/api/bank/imports/${i.id}`, "POST", { action: "acknowledge" })}>
                        Got it
                      </button>
                    </div>
                  )}
                </div>
                <div style={{ fontWeight: 700 }}>
                  {credit ? "+" : "−"}
                  {formatExact(i.amount, i.currency)}
                </div>
              </div>

              {i.review === "new" && (
                <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                  {i.suggestions.map((s) => (
                    <div key={s.transactionId} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <span className="muted">
                        Looks like your entry from {s.date}
                        {s.note ? ` (${s.note})` : ""}
                        {s.daysApart > 0 ? `, ${s.daysApart} day${s.daysApart === 1 ? "" : "s"} apart` : ""}.
                      </span>
                      <button type="button" className="btn btn-ghost" disabled={busy === i.id} onClick={() => void call(i.id, `/api/bank/imports/${i.id}`, "POST", { action: "match", transactionId: s.transactionId })}>
                        It&apos;s the same one
                      </button>
                    </div>
                  ))}
                  {i.status === "posted" && (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {!credit && buckets.length > 0 && (
                        <select
                          className="minp"
                          aria-label="Bucket to spend it from"
                          value={bucketFor[i.id] ?? ""}
                          onChange={(e) => setBucketFor({ ...bucketFor, [i.id]: e.target.value })}
                        >
                          <option value="">Spend from which bucket?</option>
                          {buckets.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.emoji} {b.name}
                            </option>
                          ))}
                        </select>
                      )}
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={busy === i.id || (!credit && buckets.length > 0 && !bucketFor[i.id])}
                        onClick={() => void accept(i.id)}
                      >
                        Record it
                      </button>
                    </div>
                  )}
                  <div>
                    <button type="button" className="btn btn-ghost" disabled={busy === i.id} onClick={() => void call(i.id, `/api/bank/imports/${i.id}`, "POST", { action: "ignore" })}>
                      Ignore
                    </button>
                  </div>
                </div>
              )}
              {error?.scope === i.id && <div className="error" role="alert" style={{ marginTop: 10 }}>{error.text}</div>}

              {exception?.importId === i.id && (
                <div className="card" style={{ marginTop: 10 }} role="group" aria-label="Fund the missing amount from another bucket">
                  <strong>The bucket is short by {formatMoney(exception.short, "NGN")}.</strong>
                  <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                    This already happened at your bank, so it can be recorded, but only by funding exactly the shortfall
                    from another bucket. That is a deliberate change to your plan, recorded with your reason.
                  </p>
                  <label className="mlbl" htmlFor={`fund-bucket-${i.id}`}>Fund it from</label>
                  <select id={`fund-bucket-${i.id}`} className="minp" value={fundBucket} onChange={(e) => setFundBucket(e.target.value)}>
                    {exception.options.map((o) => (
                      <option key={o.bucketId} value={o.bucketId}>
                        {o.name} ({formatMoney(o.available, "NGN")} available){o.protected ? " · protected bucket" : ""}
                      </option>
                    ))}
                  </select>
                  <label className="mlbl" htmlFor={`fund-reason-${i.id}`}>Why? (required)</label>
                  <input id={`fund-reason-${i.id}`} className="minp" maxLength={500} value={fundReason} onChange={(e) => setFundReason(e.target.value)} />
                  <label style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "flex-start" }}>
                    <input type="checkbox" checked={fundConfirm} onChange={(e) => setFundConfirm(e.target.checked)} />
                    <span>I understand this moves money between my buckets and is recorded as a change to my plan.</span>
                  </label>
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ marginTop: 10 }}
                    disabled={busy === i.id || !fundConfirm || fundReason.trim().length < 3}
                    onClick={() => void accept(i.id, { bucketId: fundBucket, reason: fundReason.trim() })}
                  >
                    Record with this exception
                  </button>
                </div>
              )}
            </div>
          );
        })
      )}

      <ConfirmDialog
        open={toDisconnect !== null}
        onOpenChange={(open) => {
          if (!open) setToDisconnect(null);
        }}
        title="Disconnect this bank?"
        confirmLabel="Disconnect"
        busyLabel="Disconnecting…"
        danger
        busy={busy === toDisconnect?.id}
        error={error?.scope === toDisconnect?.id ? error?.text : null}
        onConfirm={async () => {
          if (!toDisconnect) return;
          const ok = await call(toDisconnect.id, `/api/bank/connections/${toDisconnect.id}`, "DELETE");
          if (ok) setToDisconnect(null);
        }}
      >
        <p>
          FinTrack stops reading this bank straight away. Everything already imported and recorded stays. You can also
          withdraw consent at your bank.
        </p>
      </ConfirmDialog>
    </>
  );
}
