"use client";

import { cn } from "@/lib/utils";

/** Tiny decorative sparkline from a list of numbers (SVG only, tokens). */
export function Sparkline({
  values,
  className,
  tone = "primary",
}: {
  values: number[];
  className?: string;
  tone?: "primary" | "success" | "danger" | "cyan";
}) {
  const w = 72;
  const h = 28;
  const pts = values.length ? values : [0, 0];
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = max - min || 1;
  const path = pts
    .map((v, i) => {
      const x = (i / Math.max(pts.length - 1, 1)) * w;
      const y = h - ((v - min) / span) * (h - 4) - 2;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const stroke =
    tone === "success"
      ? "var(--success)"
      : tone === "danger"
        ? "var(--danger)"
        : tone === "cyan"
          ? "var(--accent-cyan)"
          : "var(--primary)";

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className={cn("overflow-visible", className)}
      width={w}
      height={h}
      aria-hidden
    >
      <path
        d={path}
        fill="none"
        stroke={stroke}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.9}
      />
    </svg>
  );
}

/** Deterministic pseudo-series from a seed value (no API). */
export function sparkFromSeed(seed: number, n = 10): number[] {
  const out: number[] = [];
  let x = Math.abs(seed) * 0.001 + 1;
  for (let i = 0; i < n; i++) {
    x = (x * 1.7 + 0.3 * Math.sin(i + seed)) % 10;
    out.push(x + i * 0.15);
  }
  return out;
}
