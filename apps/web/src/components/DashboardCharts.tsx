"use client";

/**
 * Chart.js aesthetic pass — gradient fills, rounded bars, donut center total.
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
  type ChartConfiguration,
  type Plugin,
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

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  const n = parseInt(full, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

function makeVerticalGradient(
  ctx: CanvasRenderingContext2D,
  chartArea: { top: number; bottom: number },
  color: string
) {
  const g = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
  g.addColorStop(0, color);
  g.addColorStop(1, hexToRgba(color, 0.4));
  return g;
}

const tooltipStyle = {
  backgroundColor: "oklch(0.18 0.012 160 / 0.95)",
  titleColor: "oklch(0.96 0.01 160)",
  bodyColor: "oklch(0.96 0.01 160)",
  borderColor: "oklch(0.28 0.015 160)",
  borderWidth: 1,
  cornerRadius: 8,
  padding: 10,
  displayColors: true,
  boxPadding: 4,
};

function centerTotalPlugin(totalLabel: string): Plugin<"doughnut"> {
  return {
    id: "centerTotal",
    afterDraw(chart) {
      const { ctx, chartArea } = chart;
      if (!chartArea) return;
      const cx = (chartArea.left + chartArea.right) / 2;
      const cy = (chartArea.top + chartArea.bottom) / 2;
      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "oklch(0.68 0.02 160)";
      ctx.font = "600 10px system-ui, sans-serif";
      ctx.fillText("TOTAL", cx, cy - 12);
      ctx.fillStyle = "oklch(0.96 0.01 160)";
      ctx.font =
        "700 16px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.fillText(totalLabel, cx, cy + 8);
      ctx.restore();
    },
  };
}

export function DashboardCharts({
  waterfall,
  baseCurrency,
  remainingMode = false,
}: {
  waterfall: WaterfallResult;
  baseCurrency: string;
  /** When true, line amounts are remaining balances (not allocation) */
  remainingMode?: boolean;
}) {
  const donutRef = useRef<HTMLCanvasElement>(null);
  const barRef = useRef<HTMLCanvasElement>(null);
  const donutChart = useRef<Chart | null>(null);
  const barChart = useRef<Chart | null>(null);
  const base = baseCurrency as CurrencyCode;
  const gross = waterfall.gross;

  useEffect(() => {
    if (!donutRef.current || !barRef.current) return;

    const labels = waterfall.lines.map((l) => `${l.emoji} ${l.name}`);
    const vals = waterfall.lines.map((l) => Math.round(l.allocated));
    const cols = waterfall.lines.map((l, i) => bucketColor(l.bucketId, i));
    const sumVals = vals.reduce((s, v) => s + v, 0);
    const totalLabel = formatMoney(
      remainingMode ? sumVals : gross,
      base
    );

    donutChart.current?.destroy();
    barChart.current?.destroy();

    const donutCfg: ChartConfiguration<"doughnut"> = {
      type: "doughnut",
      data: {
        labels,
        datasets: [
          {
            data: vals,
            backgroundColor: cols,
            borderWidth: 2,
            borderColor: "oklch(0.14 0.01 160)",
            hoverOffset: 4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "72%",
        plugins: {
          legend: { display: false },
          tooltip: {
            ...tooltipStyle,
            callbacks: {
              label: (ctx) => {
                const raw = Number(ctx.raw) || 0;
                const denom = remainingMode ? sumVals : gross;
                const suffix = remainingMode ? " remaining" : "";
                return `${ctx.label}: ${formatMoney(raw, base)}${suffix} (${
                  denom > 0 ? ((raw / denom) * 100).toFixed(1) : 0
                }%)`;
              },
            },
          },
        },
      },
      plugins: [centerTotalPlugin(totalLabel)],
    };

    donutChart.current = new Chart(donutRef.current, donutCfg);

    const barColors = ["#4a9eff", ...cols];
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
            backgroundColor: (context) => {
              const { chart, dataIndex } = context;
              const { ctx, chartArea } = chart;
              if (!chartArea) return barColors[dataIndex] || "#888";
              return makeVerticalGradient(
                ctx,
                chartArea,
                barColors[dataIndex] || "#888"
              );
            },
            borderWidth: 0,
            borderRadius: 8,
            borderSkipped: false,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            ...tooltipStyle,
            callbacks: {
              label: (ctx) => formatMoney(Number(ctx.raw) || 0, base),
            },
          },
        },
        scales: {
          x: {
            ticks: { color: "oklch(0.55 0.02 160)", font: { size: 10 } },
            grid: { color: "rgba(255,255,255,0.06)", display: false },
            border: { display: false },
          },
          y: {
            ticks: {
              color: "oklch(0.55 0.02 160)",
              font: { size: 10 },
              callback: (v) => {
                const n = Number(v);
                return (base === "NGN" ? "₦" : "") + Math.round(n / 1000) + "k";
              },
            },
            grid: { color: "rgba(255,255,255,0.06)" },
            border: { display: false },
          },
        },
      },
    });

    return () => {
      donutChart.current?.destroy();
      barChart.current?.destroy();
    };
  }, [waterfall, base, gross, remainingMode]);

  return (
    <div className="two-col">
      <div className="card">
        <div className="card-t">
          {remainingMode
            ? "Income allocation (remaining)"
            : "Income allocation"}
        </div>
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
        <div className="card-t">Monthly cash flow</div>
        <div className="chart-wrap">
          <canvas id="flow-c" ref={barRef} />
        </div>
      </div>
    </div>
  );
}
