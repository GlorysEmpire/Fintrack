"use client";

/**
 * Chart.js charts in the app's tokens: the allocation donut and the monthly
 * cash-flow lines. Colours are read from the theme at draw time, charts redraw
 * when the theme changes, and the draw-in is skipped under reduced motion.
 */
import { useEffect, useRef } from "react";
import { useTheme } from "next-themes";
import {
  Chart,
  ArcElement,
  CategoryScale,
  DoughnutController,
  Filler,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
  type Plugin,
} from "chart.js";
import { formatMoney, type CurrencyCode, type WaterfallResult } from "@fintrack/domain";
import { bucketColor } from "@/lib/bucket-colors";
import { prefersReducedMotion, readChartTheme, type ChartTheme } from "@/lib/chart-theme";
import type { MonthPoint } from "@/lib/monthly-series";

Chart.register(
  ArcElement,
  CategoryScale,
  DoughnutController,
  Filler,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip
);

function tooltipStyle(t: ChartTheme) {
  return {
    backgroundColor: t.surface,
    titleColor: t.text,
    bodyColor: t.text,
    borderColor: t.border,
    borderWidth: 1,
    cornerRadius: 10,
    padding: 10,
    boxPadding: 4,
  };
}

function compact(n: number, base: CurrencyCode): string {
  const sym = formatMoney(0, base).replace(/0/g, "");
  if (n >= 1_000_000) return `${sym}${+(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${sym}${Math.round(n / 1_000)}k`;
  return `${sym}${Math.round(n)}`;
}

/** Donut of what is left in each bucket, with the total in the middle */
export function AllocationChart({
  waterfall,
  baseCurrency,
}: {
  waterfall: WaterfallResult;
  baseCurrency: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { resolvedTheme } = useTheme();
  const base = baseCurrency as CurrencyCode;

  useEffect(() => {
    if (!ref.current) return;
    const t = readChartTheme();
    const labels = waterfall.lines.map((l) => `${l.emoji} ${l.name}`);
    const vals = waterfall.lines.map((l) => Math.round(l.allocated));
    const total = vals.reduce((s, v) => s + v, 0);
    const center: Plugin<"doughnut"> = {
      id: "centerTotal",
      afterDraw(chart) {
        const { ctx, chartArea } = chart;
        if (!chartArea) return;
        const cx = (chartArea.left + chartArea.right) / 2;
        const cy = (chartArea.top + chartArea.bottom) / 2;
        ctx.save();
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = t.muted;
        ctx.font = `600 12px ${t.font}`;
        ctx.fillText("LEFT IN BUCKETS", cx, cy - 14);
        ctx.fillStyle = t.text;
        ctx.font = `700 20px ${t.font}`;
        ctx.fillText(formatMoney(total, base), cx, cy + 8);
        ctx.restore();
      },
    };
    const chart = new Chart(ref.current, {
      type: "doughnut",
      data: {
        labels,
        datasets: [
          {
            data: vals,
            backgroundColor: waterfall.lines.map((l, i) => bucketColor(l.bucketId, i)),
            borderWidth: 3,
            borderColor: t.surface,
            hoverOffset: 4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "74%",
        animation: prefersReducedMotion() ? false : { duration: 800, easing: "easeOutQuart" },
        plugins: {
          legend: { display: false },
          tooltip: {
            ...tooltipStyle(t),
            callbacks: {
              label: (c) => {
                const raw = Number(c.raw) || 0;
                return `${c.label}: ${formatMoney(raw, base)} left (${total > 0 ? ((raw / total) * 100).toFixed(1) : 0}%)`;
              },
            },
          },
        },
      },
      plugins: [center],
    });
    return () => chart.destroy();
  }, [waterfall, base, resolvedTheme]);

  return (
    <>
      <div className="chart-wrap">
        <canvas id="donut-c" ref={ref} role="img" aria-label="What is left in each bucket" />
      </div>
      <div className="legend" id="donut-legend">
        {waterfall.lines.map((l, i) => (
          <div className="legend-item" key={l.bucketId}>
            <div className="legend-dot" style={{ background: bucketColor(l.bucketId, i) }} />
            {l.emoji} {l.name}
          </div>
        ))}
      </div>
    </>
  );
}

/** Income against expenses by month; the lines draw in from the left */
export function CashflowChart({
  points,
  baseCurrency,
}: {
  points: MonthPoint[];
  baseCurrency: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { resolvedTheme } = useTheme();
  const base = baseCurrency as CurrencyCode;

  useEffect(() => {
    if (!ref.current) return;
    const t = readChartTheme();
    const reduce = prefersReducedMotion();
    let progress = reduce ? 1 : 0;

    const reveal: Plugin<"line"> = {
      id: "reveal",
      beforeDatasetsDraw(chart) {
        if (progress >= 1) return;
        const { ctx, chartArea } = chart;
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, chartArea.left + (chartArea.right - chartArea.left) * progress + 8, chart.height);
        ctx.clip();
      },
      afterDatasetsDraw(chart) {
        if (progress < 1) chart.ctx.restore();
      },
    };

    const fill = (color: string) => (c: { chart: Chart }) => {
      const { ctx, chartArea } = c.chart;
      if (!chartArea) return "transparent";
      try {
        const g = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
        g.addColorStop(0, `color-mix(in oklch, ${color} 35%, transparent)`);
        g.addColorStop(1, `color-mix(in oklch, ${color} 0%, transparent)`);
        return g;
      } catch {
        return "transparent";
      }
    };

    const chart = new Chart(ref.current, {
      type: "line",
      data: {
        labels: points.map((p) => p.label),
        datasets: [
          {
            label: "Income",
            data: points.map((p) => Math.round(p.income)),
            borderColor: t.income,
            backgroundColor: fill(t.income),
            fill: true,
            tension: 0.35,
            borderWidth: 2.5,
            pointRadius: 0,
            pointHoverRadius: 5,
            pointBackgroundColor: t.income,
          },
          {
            label: "Expenses",
            data: points.map((p) => Math.round(p.expenses)),
            borderColor: t.expense,
            backgroundColor: fill(t.expense),
            fill: true,
            tension: 0.35,
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 5,
            pointBackgroundColor: t.expense,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        animation: reduce
          ? false
          : {
              duration: 800,
              easing: "easeOutQuart",
              onProgress: (a) => {
                progress = a.currentStep / (a.numSteps || 1);
              },
              onComplete: () => {
                progress = 1;
              },
            },
        plugins: {
          legend: { display: false },
          tooltip: {
            ...tooltipStyle(t),
            callbacks: { label: (c) => `${c.dataset.label}: ${formatMoney(Number(c.raw) || 0, base)}` },
          },
        },
        scales: {
          x: {
            ticks: { color: t.muted, font: { size: 12, family: t.font } },
            grid: { display: false },
            border: { display: false },
          },
          y: {
            beginAtZero: true,
            ticks: {
              color: t.muted,
              font: { size: 12, family: t.font },
              maxTicksLimit: 5,
              callback: (v) => compact(Number(v), base),
            },
            grid: { color: t.grid },
            border: { display: false },
          },
        },
      },
      plugins: [reveal],
    });
    return () => chart.destroy();
  }, [points, base, resolvedTheme]);

  return (
    <div className="chart-wrap">
      <canvas id="flow-c" ref={ref} role="img" aria-label="Income and expenses by month" />
    </div>
  );
}
