"use client";

/**
 * RESET FINTRACK — the deliberate way to erase your financial data.
 *
 * Never one click: the button only opens a dialog that spells out what is
 * erased and what is kept, and nothing happens until the user types the
 * confirmation words. The server checks those words again.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "./ConfirmDialog";
import {
  RESET_CONFIRMATION_PHRASE,
  isResetConfirmed,
} from "@/lib/reset-confirmation";
import type { ResetCounts } from "@/lib/reset";

function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function ResetFinTrack({
  counts,
  email,
}: {
  /** What a reset would erase right now */
  counts: ResetCounts;
  email: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reset() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: typed }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Reset failed. Nothing was changed.");
      // Back to first-launch setup, with no stale screens left behind
      router.replace("/onboarding");
      router.refresh();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Reset failed. Nothing was changed."
      );
      setBusy(false);
    }
  }

  return (
    <div className="card danger-zone">
      <h2>Reset FinTrack</h2>
      <p style={{ marginTop: 6 }}>
        Erase all of your financial data and start again from setup. Your
        account and sign-in are kept.
      </p>
      <button
        type="button"
        className="btn btn-danger-outline"
        onClick={() => {
          setTyped("");
          setError(null);
          setOpen(true);
        }}
      >
        Reset FinTrack…
      </button>

      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Reset FinTrack?"
        confirmLabel="Erase my data and start over"
        busyLabel="Erasing…"
        cancelLabel="Cancel — keep everything"
        danger
        busy={busy}
        confirmDisabled={!isResetConfirmed(typed)}
        error={error}
        onConfirm={reset}
      >
        <p>
          <strong>This permanently erases:</strong>
        </p>
        <ul>
          <li>
            <strong>
              {count(counts.transactions, "transaction", "transactions")}
            </strong>
            : every income and expense you have recorded
          </li>
          <li>
            <strong>Your plan</strong> and all its buckets, with every bucket
            balance and all carried-over money
          </li>
          <li>
            <strong>
              {count(counts.incomeSources, "income source", "income sources")}
            </strong>
          </li>
          <li>
            <strong>
              {count(counts.recurringRules, "recurring rule", "recurring rules")}
            </strong>
          </li>
          <li>
            <strong>
              {count(counts.inboxMessages, "Inbox message", "Inbox messages")}
            </strong>
          </li>
          <li>
            Your conversation with Steward (
            {count(counts.aiMessages, "message", "messages")})
          </li>
        </ul>
        <p>
          <strong>What is kept:</strong> your account ({email}), your password
          and sign-in, your base currency and display settings. You stay signed
          in.
        </p>
        <p>
          <strong>This can not be undone.</strong> FinTrack has no backup or
          export to restore from. Afterwards you go back to setup to build a
          plan again.
        </p>
        <label className="mlbl" htmlFor="reset-confirm">
          Type {RESET_CONFIRMATION_PHRASE} to confirm
        </label>
        <input
          id="reset-confirm"
          className="minp"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder={RESET_CONFIRMATION_PHRASE}
          value={typed}
          disabled={busy}
          onChange={(e) => setTyped(e.target.value)}
        />
      </ConfirmDialog>
    </div>
  );
}
