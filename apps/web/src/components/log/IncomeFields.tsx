import Link from "next/link";
import { formatMoney, type CurrencyCode } from "@fintrack/domain";
import { InfoTip } from "@/components/ui/info-tip";
import type { LogSource } from "./types";

type Preview = { bucketId: string; name: string; emoji: string; added: number }[];

/** Which income source it came from, and what it adds to each bucket */
export function IncomeFields({
  sources,
  sourceId,
  onSource,
  isEdit,
  preview,
  hasPlan,
  hasAmount,
  inCurrentMonth,
  base,
  onNavigate,
}: {
  sources: LogSource[];
  sourceId: string;
  onSource: (id: string) => void;
  isEdit: boolean;
  preview: Preview | null;
  hasPlan: boolean;
  hasAmount: boolean;
  inCurrentMonth: boolean;
  base: CurrencyCode;
  onNavigate: () => void;
}) {
  return (
    <>
      {sources.length === 0 ? (
        <div className="mt-4 rounded-xl border border-border bg-muted/40 p-3">
          <p className="mb-2.5 text-sm leading-snug">
            You don&apos;t have any income sources yet. Add one before logging income. We never invent defaults for you.
          </p>
          <Link href="/income" className="inline-block rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground" onClick={onNavigate}>
            Add income source →
          </Link>
        </div>
      ) : (
        <>
          <label className="mlbl mt-4 block" htmlFor="tx-source">
            Income source
          </label>
          <select id="tx-source" className="minp" value={sourceId} onChange={(e) => onSource(e.target.value)} required>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.emoji} {s.name}
              </option>
            ))}
          </select>
        </>
      )}

      {preview && (sources.length > 0 || isEdit) && (
        <div className="mt-3 rounded-xl bg-muted p-3">
          <div className="mb-2.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
            This income adds to your buckets this month
          </div>
          <div className="grid grid-cols-3 gap-2">
            {preview.map((l) => (
              <div key={l.bucketId} className="text-center">
                <div className="text-xs uppercase text-subtle">
                  {l.emoji} {l.name}
                </div>
                <div className="text-xs font-bold tabular-nums text-primary">+{formatMoney(l.added, base)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {hasAmount && (!inCurrentMonth || !hasPlan) && (
        <div className="mt-2 flex items-center gap-2 text-xs text-subtle">
          {hasPlan ? "Filed under another month" : "No plan yet"}
          <InfoTip label="About this income">
            {hasPlan
              ? "This income is split by your plan in the month it is filed under, and buckets that carry over are updated from there."
              : "No plan yet. Income still saves. Set a plan in Settings to auto-split into buckets."}
          </InfoTip>
        </div>
      )}
    </>
  );
}
