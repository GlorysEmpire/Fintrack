"use client";

import { motion, useReducedMotion } from "framer-motion";
import { durations, ease } from "@/lib/motion";

/** A ring that fills from empty to `fraction` (0 to 1) when it appears (M7). */
export function ProgressRing({
  fraction,
  color,
  size = 76,
  stroke = 7,
  children,
}: {
  fraction: number;
  /** Any CSS colour, or a token as var(--color-…) */
  color: string;
  size?: number;
  stroke?: number;
  children?: React.ReactNode;
}) {
  const reduce = useReducedMotion();
  const r = (size - stroke) / 2;
  const f = Math.max(0, Math.min(1, fraction));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-muted)" strokeWidth={stroke} />
        {f > 0 && (
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            initial={{ pathLength: reduce ? f : 0 }}
            animate={{ pathLength: f }}
            transition={{ duration: reduce ? 0 : durations.hero, ease: ease.out }}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-xl">{children}</div>
    </div>
  );
}
