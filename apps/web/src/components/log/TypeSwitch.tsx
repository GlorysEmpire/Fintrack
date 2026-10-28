import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

/** Expense or income, as two big buttons */
export function TypeSwitch({
  type,
  onChange,
}: {
  type: "i" | "e";
  onChange: (t: "i" | "e") => void;
}) {
  const opts = [
    { v: "e" as const, label: "Expense", icon: ArrowUpRight, on: "border-destructive bg-destructive/12 text-destructive" },
    { v: "i" as const, label: "Income", icon: ArrowDownLeft, on: "border-primary bg-primary/12 text-primary" },
  ];
  return (
    <div className="grid grid-cols-2 gap-2" role="group" aria-label="Type">
      {opts.map((o) => (
        <button
          key={o.v}
          type="button"
          aria-pressed={type === o.v}
          onClick={() => onChange(o.v)}
          className={cn(
            "flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-ring",
            type === o.v ? o.on : "border-border bg-muted text-muted-foreground hover:text-foreground"
          )}
        >
          <o.icon className="h-4 w-4" aria-hidden />
          {o.label}
        </button>
      ))}
    </div>
  );
}
