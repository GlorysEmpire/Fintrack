"use client";

/**
 * Log income or an expense, or edit one that is still inside its edit window.
 * The state and rules live in log/useLogForm; this puts the pieces together.
 */
import Link from "next/link";
import { EDIT_WINDOW_RULE, editWindowRemainingLabel } from "@fintrack/domain";
import { formatDay } from "@/lib/format-date";
import { InfoTip } from "@/components/ui/info-tip";
import { BucketNotice } from "./log/BucketNotice";
import { CategoryPicker } from "./log/CategoryPicker";
import { AmountField } from "./log/AmountField";
import { ExceptionPanel } from "./log/ExceptionPanel";
import { IncomeFields } from "./log/IncomeFields";
import { LogSheetShell } from "./log/LogSheetShell";
import { StreakBadge } from "./log/StreakBadge";
import { TypeSwitch } from "./log/TypeSwitch";
import type { LogFormProps } from "./log/types";
import { useLogForm } from "./log/useLogForm";

export type { AccountOption } from "./log/types";

export function LogTransactionModal(props: LogFormProps) {
  const f = useLogForm(props);
  const { open, onClose, plan, sources, accounts = [], bucketRemaining = {}, streak } = props;
  if (!open) return null;

  const { base, isEdit, type } = f;
  const title = isEdit ? "Edit transaction" : "Log transaction";
  const saveLabel = f.loading
    ? "Saving…"
    : type === "i" && !isEdit && sources.length === 0
      ? "Add a source first"
      : isEdit
        ? "Save changes"
        : "Save transaction";

  return (
    <LogSheetShell
      title={title}
      onClose={onClose}
      badge={!isEdit && streak ? <StreakBadge days={streak.current} loggedToday={streak.loggedToday} /> : null}
      footer={
        <div className="space-y-2">
          <button
            type="button"
            className="h-12 w-full rounded-xl bg-primary font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={f.loading || (type === "i" && !isEdit && sources.length === 0)}
            onClick={() => f.save()}
          >
            {saveLabel}
          </button>
          <button type="button" className="h-10 w-full rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground" onClick={onClose}>
            Cancel
          </button>
        </div>
      }
    >
      {isEdit ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          {type === "i" ? "Income" : "Expense"}
          {f.editWindow && !f.editWindow.locked && ` · you can still change or delete this for ${editWindowRemainingLabel(f.editWindow.msRemaining)}`}
        </p>
      ) : (
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <TypeSwitch type={type} onChange={(t) => { f.setType(t); f.setError(null); }} />
          </div>
          <InfoTip label="About editing" align="end">
            {EDIT_WINDOW_RULE}
          </InfoTip>
        </div>
      )}

      <AmountField amount={f.amount} onAmount={f.setAmount} currency={f.currency} onCurrency={f.setCurrency} hint={f.convHint} />

      <label className="mlbl mt-3 block" htmlFor="tx-date">
        Date
      </label>
      <input
        id="tx-date"
        className="minp"
        type="date"
        name="date"
        value={f.dateKey}
        min="2000-01-01"
        max={f.todayKey || undefined}
        onChange={(e) => {
          f.setDateKey(e.target.value);
          f.setError(null);
        }}
      />
      {f.backdated && f.dateKey && (
        <p className="mt-1 text-xs text-subtle">Filed under {formatDay(`${f.dateKey}T12:00:00.000Z`)}. Its month is recalculated to include it.</p>
      )}

      {type === "i" && (
        <IncomeFields
          sources={sources}
          sourceId={f.sourceId}
          onSource={f.setSourceId}
          isEdit={isEdit}
          preview={f.incomePreview}
          hasPlan={Boolean(plan)}
          hasAmount={f.amtNum > 0}
          inCurrentMonth={f.inCurrentMonth}
          base={base}
          onNavigate={onClose}
        />
      )}

      {type === "e" && (
        <>
          <label className="mlbl mt-3 block" htmlFor="tx-bucket">
            Draw from bucket
          </label>
          {f.buckets.length ? (
            <select
              id="tx-bucket"
              className="minp"
              value={f.bucketId}
              onChange={(e) => {
                f.setBucketId(e.target.value);
                f.setError(null);
              }}
            >
              {f.buckets.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.emoji} {b.name}
                  {b.archived ? " (archived)" : ""}
                  {!b.archived && f.inCurrentMonth && bucketRemaining[b.id] !== undefined
                    ? bucketRemaining[b.id] < -0.005
                      ? ` · ${f.formatMoney(-bucketRemaining[b.id])} below zero`
                      : ` · ${f.formatMoney(Math.max(0, bucketRemaining[b.id]))} available`
                    : ""}
                </option>
              ))}
            </select>
          ) : (
            <p className="text-sm text-muted-foreground">No plan buckets. The expense still logs. Set a plan for tracking.</p>
          )}

          <CategoryPicker
            bucketId={f.bucketId}
            category={f.category}
            onPick={(id) => {
              f.setCategory(id);
              f.setError(null);
            }}
          />

          {f.bucketId && f.selectedBucket && (
            <BucketNotice
              bucket={f.selectedBucket}
              base={base}
              remaining={f.remaining}
              cross={f.cross}
              blocked={f.blockedHere}
              shortfallText={f.shortfallText}
              inCurrentMonth={f.inCurrentMonth}
            />
          )}
        </>
      )}

      {f.accountChoices.length > 0 && (
        <>
          <label className="mlbl mt-3 block" htmlFor="tx-account">
            Account (optional)
          </label>
          <select id="tx-account" className="minp" value={f.accountId} onChange={(e) => f.setAccountId(e.target.value)}>
            <option value="">Not assigned to an account</option>
            {f.accountChoices.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
                {a.kind === "liability" ? (type === "e" ? " (debt: raises what you owe)" : " (debt: lowers what you owe)") : ""}
              </option>
            ))}
          </select>
        </>
      )}
      {!isEdit && accounts.length > 1 && (
        <p className="mt-2 text-xs text-subtle">
          Moving money between your accounts?{" "}
          <Link href="/accounts" className="font-medium underline" onClick={onClose}>
            Make a transfer
          </Link>
        </p>
      )}

      <label className="mlbl mt-3 block" htmlFor="tx-note">
        Note {f.cross ? <span className="text-destructive">(required for cross-bucket)</span> : <span className="font-normal normal-case text-subtle">(optional)</span>}
      </label>
      <input
        id="tx-note"
        className="minp"
        value={f.note}
        maxLength={500}
        onChange={(e) => f.setNote(e.target.value)}
        placeholder={f.cross ? "Why are you drawing from this bucket?" : "e.g. client payment, DSTV, Uber"}
      />

      {f.error && (
        <div className="error mt-3" role="alert">
          {f.error}
        </div>
      )}

      {f.shortfall && (
        <ExceptionPanel
          shortfall={f.shortfall}
          base={base}
          fundBucket={f.fundBucket}
          onFundBucket={f.setFundBucket}
          reason={f.fundReason}
          onReason={f.setFundReason}
          confirmed={f.fundConfirm}
          onConfirmed={f.setFundConfirm}
          busy={f.loading}
          onRecord={() => f.save({ bucketId: f.fundBucket, reason: f.fundReason.trim() })}
        />
      )}
    </LogSheetShell>
  );
}
