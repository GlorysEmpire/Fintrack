"use client";

/**
 * Charts from legacy drawCharts() — same Chart.js options, colors, cutout.
 * WFC palette: tithe purple, emergency blue, invest green, give pink, save mint, spend yellow
 */
import { useEffect, useRef } from "react";
import {
  Chart,
  ArcElement,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  DoughnutController,
  BarController,
} from "chart.js";
import type { WaterfallResult } from "@fintrack/domain";
import { formatMoney, type CurrencyCode } from "@fintrack/domain";
import { bucketColor } from "@/lib/bucket-colors";

Chart.register(
  ArcElement,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  DoughnutController,
  BarController
);

export function DashboardCharts({
  waterfall,
  baseCurrency,
}: {
  waterfall: WaterfallResult;
  baseCurrency: string;
}) {
  const donutRef = useRef<HTMLCanvasElement>(null);
  const barRef = useRef<HTMLCanvasElement>(null);
  const donutChart = useRef<Chart | null>(null);
  const barChart = useRef<Chart | null>(null);
  const base = baseCurrency as CurrencyCode;
  const gross = waterfall.gross;

  useEffect(() => {
    if (!donutRef.current || !barRef.current) return;

    // Same as legacy: labels with emoji, Object.values(WFC) colors
    const labels = waterfall.lines.map((l) => `${l.emoji} ${l.name}`);
    const vals = waterfall.lines.map((l) => Math.round(l.allocated));
    const cols = waterfall.lines.map((l, i) => bucketColor(l.bucketId, i));

    donutChart.current?.destroy();
    barChart.current?.destroy();

    donutChart.current = new Chart(donutRef.current, {
      type: "doughnut",
      data: {
        labels,
        datasets: [
          {
            data: vals,
            backgroundColor: cols,
            borderWidth: 2,
            borderColor: "#1a1a1a",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "65%",
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const raw = Number(ctx.raw) || 0;
                return `${ctx.label}: ${formatMoney(raw, base)} (${
                  gross > 0 ? ((raw / gross) * 100).toFixed(1) : 0
                }%)`;
              },
            },
          },
        },
      },
    });

    barChart.current = new Chart(barRef.current, {
      type: "bar",
      data: {
        labels: ["Gross", ...waterfall.lines.map((l) => l.name)],
        datasets: [
          {
            data: [
              Math.round(gross),
              ...waterfall.lines.map((l) => Math.round(l.allocated)),
            ],
            backgroundColor: ["#4a9eff", ...cols],
            borderWidth: 0,
            borderRadius: 4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => formatMoney(Number(ctx.raw) || 0, base),
            },
          },
        },
        scales: {
          x: {
            ticks: { color: "#555", font: { size: 10 } },
            grid: { display: false },
          },
          y: {
            ticks: {
              color: "#555",
              font: { size: 10 },
              callback: (v) => {
                const n = Number(v);
                return (base === "NGN" ? "₦" : "") + Math.round(n / 1000) + "k";
              },
            },
            grid: { color: "#222" },
          },
        },
      },
    });

    return () => {
      donutChart.current?.destroy();
      barChart.current?.destroy();
    };
  }, [waterfall, base, gross]);

  // Markup matches legacy: two-col > card > card-t + chart-wrap + legend
  return (
    <div className="two-col">
      <div className="card">
        <div className="card-t">📊 Income allocation</div>
        <div className="chart-wrap">
          <canvas id="donut-c" ref={donutRef} />
        </div>
        <div className="legend" id="donut-legend">
          {waterfall.lines.map((l, i) => (
            <div className="legend-item" key={l.bucketId}>
              <div
                className="legend-dot"
                style={{ background: bucketColor(l.bucketId, i) }}
              />
              {l.emoji} {l.name}
            </div>
          ))}
        </div>
      </div>
      <div className="card">
        <div className="card-t">📈 Monthly cash flow</div>
        <div className="chart-wrap">
          <canvas id="flow-c" ref={barRef} />
        </div>
      </div>
    </div>
  );
}
