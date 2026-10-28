import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** One headline number with an icon, a label and a one-line explanation. */
export function MetricCard({
  label,
  sub,
  icon: Icon,
  valueClassName,
  chipClassName,
  children,
}: {
  label: string;
  sub: string;
  icon: LucideIcon;
  valueClassName?: string;
  chipClassName?: string;
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
      </div>
    </div>
  );
}
