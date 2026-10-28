import type { LucideIcon } from "lucide-react";

/** A card heading with a lucide icon (replaces emoji in titles) */
export function SectionTitle({
  icon: Icon,
  children,
  hint,
}: {
  icon: LucideIcon;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="mb-4 flex items-center gap-2 text-card-title font-semibold text-foreground">
      <Icon className="h-4 w-4 text-primary" aria-hidden />
      {children}
      {hint && <span className="text-xs font-normal text-subtle">{hint}</span>}
    </div>
  );
}
