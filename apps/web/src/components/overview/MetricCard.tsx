import { cn } from "@/lib/utils";

/** One headline number with a label and a one-line explanation. */
export function MetricCard({
  label,
  sub,
  valueClassName,
  children,
}: {
  label: string;
  sub: string;
  valueClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="metric">
      <div className="m-lbl">{label}</div>
      <div className={cn("m-val", valueClassName)}>{children}</div>
      <div className="m-sub">{sub}</div>
    </div>
  );
}
