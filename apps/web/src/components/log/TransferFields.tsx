"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { activeBuckets, sortBucketsByPlanOrder, type BudgetPlan } from "@fintrack/domain";
import { toDateInputValue } from "@/lib/format-date";
import { toast } from "@/components/ui/toast";
import { AmountField } from "./AmountField";
import type { AccountOption } from "./types";

/** State and request for moving money between two of your accounts, with an optional fee. */
export function useTransferForm(accounts: AccountOption[], plan: BudgetPlan | null, onDone: () => void) {
  const router = useRouter();
  const buckets = plan ? sortBucketsByPlanOrder(activeBuckets(plan.buckets)) : [];
  const [from, setFrom] = useState(accounts[0]?.id ?? "");
  const [to, setTo] = useState(accounts[1]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [toAmount, setToAmount] = useState("");
  const [fee, setFee] = useState("");
  const [feeBucket, setFeeBucket] = useState(buckets.find((b) => b.id === "spend")?.id ?? buckets[0]?.id ?? "");
  const [date, setDate] = useState(() => toDateInputValue(new Date()));
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const fromAcc = accounts.find((a) => a.id === from);
  const toAcc = accounts.find((a) => a.id === to);
  const cross = Boolean(fromAcc && toAcc && fromAcc.currency !== toAcc.currency);

  async function save() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromAccountId: from,
          toAccountId: to,
          amount: Number(amount),
          toAmount: cross ? Number(toAmount) : null,
          fee: fee ? Number(fee) : null,
          feeBucketId: fee && buckets.length > 0 ? feeBucket : null,
          date,
          note: note.trim() || null,
          reference: null,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Could not record the transfer.");
      onDone();
      toast("Transfer recorded");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not record the transfer.");
    } finally {
      setBusy(false);
    }
  }

  return { buckets, from, setFrom, to, setTo, amount, setAmount, toAmount, setToAmount, fee, setFee, feeBucket, setFeeBucket, date, setDate, note, setNote, error, busy, cross, fromAcc, toAcc, save };
}

export type TransferForm = ReturnType<typeof useTransferForm>;

/** The fields of the transfer form; the sheet's footer button saves it. */
export function TransferFields({ f, accounts }: { f: TransferForm; accounts: AccountOption[] }) {
  return (
    <>
      <label className="mlbl mt-4 block" htmlFor="tr-from">From account</label>
      <select id="tr-from" className="minp" value={f.from} onChange={(e) => f.setFrom(e.target.value)}>
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>
        ))}
      </select>
      <label className="mlbl mt-3 block" htmlFor="tr-to">To account</label>
      <select id="tr-to" className="minp" value={f.to} onChange={(e) => f.setTo(e.target.value)}>
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>
        ))}
      </select>

      <AmountField amount={f.amount} onAmount={f.setAmount} currency="NGN" onCurrency={() => {}} fixedCurrency={f.fromAcc?.currency} label="Amount sent" hint="" />

      {f.cross && (
        <>
          <label className="mlbl mt-1 block" htmlFor="tr-to-amount">{`Amount received (${f.toAcc?.currency})`}</label>
          <input id="tr-to-amount" className="minp" inputMode="decimal" value={f.toAmount} onChange={(e) => f.setToAmount(e.target.value)} />
        </>
      )}

      <label className="mlbl mt-3 block" htmlFor="tr-fee">Fee (optional)</label>
      <input id="tr-fee" className="minp" inputMode="decimal" placeholder="0" value={f.fee} onChange={(e) => f.setFee(e.target.value)} />
      {f.fee && f.buckets.length > 0 && (
        <>
          <label className="mlbl mt-3 block" htmlFor="tr-fee-bucket">Bucket the fee is spent from</label>
          <select id="tr-fee-bucket" className="minp" value={f.feeBucket} onChange={(e) => f.setFeeBucket(e.target.value)}>
            {f.buckets.map((b) => (
              <option key={b.id} value={b.id}>Fee from: {b.emoji} {b.name}</option>
            ))}
          </select>
        </>
      )}

      <label className="mlbl mt-3 block" htmlFor="tr-date">Date</label>
      <input id="tr-date" className="minp" type="date" value={f.date} onChange={(e) => f.setDate(e.target.value)} />
      <label className="mlbl mt-3 block" htmlFor="tr-note">Note (optional)</label>
      <input id="tr-note" className="minp" maxLength={200} value={f.note} onChange={(e) => f.setNote(e.target.value)} />
      {f.error && <div className="error mt-3" role="alert">{f.error}</div>}
    </>
  );
}
