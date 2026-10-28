"use client";

import { useState } from "react";
import { EXPENSE_CATEGORIES, isCrossBucket } from "@fintrack/domain";
import { transactionIcon } from "@/lib/category-icons";
import { cn } from "@/lib/utils";

const shortLabel = (label: string) => label.split(" (")[0];

function Chip({ id, label, on, onPick }: { id: string; label: string; on: boolean; onPick: (id: string) => void }) {
  const Icon = transactionIcon("e", id);
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={label}
      title={label}
      onClick={() => onPick(id)}
      className={cn(
        "flex flex-col items-center gap-1 rounded-xl border px-1 py-2 text-center text-xs font-medium leading-tight transition-colors focus-visible:outline-2 focus-visible:outline-ring",
        on ? "border-primary bg-primary/12 text-primary" : "border-border bg-muted text-muted-foreground hover:text-foreground"
      )}
    >
      <Icon className="h-5 w-5" aria-hidden />
      <span className="line-clamp-2">{shortLabel(label)}</span>
    </button>
  );
}

/**
 * What the money was spent on, as icons. The ones that fit the chosen bucket come
 * first; the rest sit under "More" because spending them from this bucket is a
 * cross-bucket expense that needs a written reason.
 */
export function CategoryPicker({
  bucketId,
  category,
  onPick,
}: {
  bucketId: string;
  category: string;
  onPick: (id: string) => void;
}) {
  const fits = EXPENSE_CATEGORIES.filter((c) => !bucketId || !isCrossBucket(bucketId, c.id));
  const rest = EXPENSE_CATEGORIES.filter((c) => bucketId && isCrossBucket(bucketId, c.id));
  const [more, setMore] = useState(false);
  const showMore = more || rest.some((c) => c.id === category);

  return (
    <div>
      <div className="mlbl mt-4 block" id="tx-category-label">
        Spent on
      </div>
      <div role="group" aria-labelledby="tx-category-label" className="grid grid-cols-4 gap-2">
        {fits.map((c) => (
          <Chip key={c.id} id={c.id} label={c.label} on={category === c.id} onPick={onPick} />
        ))}
      </div>
      {rest.length > 0 && (
        <>
          <button
            type="button"
            aria-expanded={showMore}
            onClick={() => setMore((m) => !m)}
            className="mt-2 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            {showMore ? "Fewer categories" : "More categories"}
          </button>
          {showMore && (
            <div className="mt-2 grid grid-cols-4 gap-2">
              {rest.map((c) => (
                <Chip key={c.id} id={c.id} label={c.label} on={category === c.id} onPick={onPick} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
