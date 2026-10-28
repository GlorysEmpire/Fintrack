import { ArrowDown, ArrowUp, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** One headline number with an icon, a label and a one-line explanation. */
export function MetricCard({
  label,
  sub,
  icon: Icon,
  valueClassName,
  chipClassName,
  delta,
  children,
}: {
  label: string;
  sub: string;
  icon: LucideIcon;
  valueClassName?: string;
  chipClassName?: string;
  /** Change vs last month in whole percent (null or omitted: nothing shown); rising is good only when `upIsGood` */
  delta?: { pct: number | null; upIsGood: boolean };
  children: React.ReactNode;
}) {
  return (
    <div className="metric flex items-start gap-3">
      <span
        className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary", chipClassName)}
        aria-hidden
      >
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <div className="m-lbl">{label}</div>
        <div className={cn("m-val", valueClassName)}>{children}</div>
        <div className="m-sub">{sub}</div>
        {delta && delta.pct !== null && (
          <div
            className={cn(
              "mt-1 flex items-center gap-1 text-xs font-semibold",
              delta.pct === 0 ? "text-muted-foreground" : (delta.pct > 0) === delta.upIsGood ? "text-primary" : "text-destructive"
            )}
          >
            {delta.pct > 0 ? <ArrowUp className="h-3 w-3" aria-hidden /> : delta.pct < 0 ? <ArrowDown className="h-3 w-3" aria-hidden /> : null}
            {Math.abs(delta.pct)}% <span className="font-normal text-muted-foreground">vs last month</span>
          </div>
        )}
      </div>
    </div>
  );
}
