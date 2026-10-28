import { BUCKET_DESCRIPTIONS, BUCKET_LIMIT_RULE, formatMoney, type CurrencyCode, type PlanBucket } from "@fintrack/domain";
import { InfoTip } from "@/components/ui/info-tip";
import { cn } from "@/lib/utils";

/**
 * What the chosen bucket can cover, or why this expense can not be saved yet.
 * A blocked expense only ever states what is available against what was asked.
 */
export function BucketNotice({
  bucket,
  base,
  remaining,
  cross,
  blocked,
  shortfallText,
  inCurrentMonth,
}: {
  bucket: PlanBucket;
  base: CurrencyCode;
  remaining: number | undefined;
  cross: boolean;
  blocked: boolean;
  shortfallText: string;
  inCurrentMonth: boolean;
}) {
  const problem = cross || blocked;
  const desc = BUCKET_DESCRIPTIONS[bucket.id] || "";
  return (
    <div
      role="status"
      className={cn(
        "mt-3 rounded-xl border px-3 py-2.5 text-sm leading-snug",
        problem
          ? "border-destructive/40 bg-destructive/10 text-destructive"
          : "border-primary/40 bg-primary/10 text-primary"
      )}
    >
      {cross ? (
        <>
          <strong>Cross-bucket:</strong> this category does not match <strong>{bucket.name}</strong>.
          {remaining !== undefined && <> Remaining: <strong>{formatMoney(Math.max(0, remaining), base)}</strong>.</>}{" "}
          <strong>Write a reason in the Note field to save.</strong>
          {desc && (
            <InfoTip label={`About the ${bucket.name} bucket`} className="ml-1.5">
              {desc}
            </InfoTip>
          )}
        </>
      ) : blocked ? (
        <>
          <strong>{shortfallText}</strong>
          <InfoTip label="About the bucket limit" className="ml-1.5">
            {BUCKET_LIMIT_RULE}
          </InfoTip>
        </>
      ) : (
        <span className="flex items-center justify-between gap-2">
          <span>
            <strong>
              {bucket.emoji} {bucket.name}
            </strong>
            {remaining !== undefined && (
              <> · <strong>{formatMoney(Math.max(0, remaining), base)}</strong> left this month</>
            )}
            {!inCurrentMonth && " · checked against what it had on the date you picked"}
          </span>
          {desc && (
            <InfoTip label={`About the ${bucket.name} bucket`} align="end">
              {desc}
            </InfoTip>
          )}
        </span>
      )}
    </div>
  );
}
