"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, Info, Lightbulb } from "lucide-react";
import { InfoTip } from "@/components/ui/info-tip";
import { cn } from "@/lib/utils";

export type Note = {
  id: string;
  severity: "attention" | "info" | "good";
  title: string;
  detail: string;
  evidence: string[];
  next?: string;
};

const LOOK = {
  attention: { icon: AlertTriangle, chip: "bg-warning/15 text-warning" },
  info: { icon: Info, chip: "bg-primary/12 text-primary" },
  good: { icon: CheckCircle2, chip: "bg-primary/12 text-primary" },
} as const;

/**
 * What Steward notices in your own numbers, worked out by fixed rules. This works with
 * or without the online Steward, so there is always something useful here.
 */
export function InsightCards({ notes, startOpen }: { notes: Note[]; startOpen: boolean }) {
  const [open, setOpen] = useState(startOpen);
  if (notes.length === 0) return null;
  return (
    <section className="card !mb-3" aria-labelledby="notes-title">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <span id="notes-title" className="flex items-center gap-2 text-card-title font-semibold">
          <Lightbulb className="h-4 w-4 text-primary" aria-hidden />
          Steward&apos;s notes
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{notes.length}</span>
        </span>
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <ul className="mt-3 grid gap-3 md:grid-cols-2">
          {notes.map((n) => {
            const Icon = LOOK[n.severity].icon;
            return (
              <li key={n.id} className="rounded-xl border border-border bg-muted/40 p-3">
                <div className="flex items-start gap-2.5">
                  <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", LOOK[n.severity].chip)} aria-hidden>
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-sm font-semibold">{n.title}</div>
                      {n.evidence.length > 0 && (
                        <InfoTip label={`How "${n.title}" was worked out`} align="end">
                          <ul className="grid gap-1">
                            {n.evidence.map((e) => (
                              <li key={e}>{e}</li>
                            ))}
                          </ul>
                        </InfoTip>
                      )}
                    </div>
                    <p className="mt-0.5 text-sm text-muted-foreground">{n.detail}</p>
                    {n.next && <p className="mt-1.5 text-sm font-medium text-primary">{n.next}</p>}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
