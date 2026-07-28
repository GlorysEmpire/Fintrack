"use client";

/**
 * Signature blue→cyan particle waterfall (canvas + rAF).
 * Pauses when tab hidden; skips entirely under prefers-reduced-motion.
 */
import { useEffect, useRef } from "react";

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
};

function cssVar(name: string, fallback: string) {
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return v || fallback;
}

export function WaterfallCanvas({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      // Soft static glow only
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const g = ctx.createLinearGradient(w * 0.5, 0, w * 0.5, h);
      g.addColorStop(0, cssVar("--primary", "oklch(0.75 0.16 235)"));
      g.addColorStop(1, "transparent");
      ctx.fillStyle = g;
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.moveTo(w * 0.35, 0);
      ctx.bezierCurveTo(w * 0.55, h * 0.3, w * 0.7, h * 0.5, w * 0.55, h);
      ctx.lineTo(w * 0.35, h);
      ctx.closePath();
      ctx.fill();
      return;
    }

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let raf = 0;
    let running = true;
    const particles: Particle[] = [];
    const COUNT = 800;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const spawn = (p?: Particle): Particle => {
      const w = canvas.clientWidth;
      const lipX = w * 0.42 + Math.random() * w * 0.12;
      const n: Particle = p || {
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        life: 0,
        max: 1,
        size: 1,
      };
      n.x = lipX;
      n.y = -4 + Math.random() * 8;
      n.vx = (Math.random() - 0.5) * 0.35;
      n.vy = 1.2 + Math.random() * 2.4;
      n.life = 0;
      n.max = 0.55 + Math.random() * 0.9;
      n.size = 0.6 + Math.random() * 1.8;
      return n;
    };

    for (let i = 0; i < COUNT; i++) {
      const p = spawn();
      p.life = Math.random() * p.max;
      p.y = Math.random() * canvas.clientHeight;
      particles.push(p);
    }

    const primary = cssVar("--primary", "oklch(0.75 0.16 235)");
    const cyan = cssVar("--accent-cyan", "oklch(0.82 0.15 200)");

    const tick = () => {
      if (!running) return;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);

      // Soft pool glow
      const pool = ctx.createRadialGradient(
        w * 0.52,
        h * 0.92,
        4,
        w * 0.52,
        h * 0.92,
        w * 0.35
      );
      pool.addColorStop(0, cyan);
      pool.addColorStop(0.4, primary);
      pool.addColorStop(1, "transparent");
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = pool;
      ctx.globalAlpha = 0.22;
      ctx.beginPath();
      ctx.ellipse(w * 0.52, h * 0.94, w * 0.28, h * 0.08, 0, 0, Math.PI * 2);
      ctx.fill();

      // Fall curtain gradient path (hint)
      const curtain = ctx.createLinearGradient(w * 0.45, 0, w * 0.65, h);
      curtain.addColorStop(0, primary);
      curtain.addColorStop(1, cyan);
      ctx.strokeStyle = curtain;
      ctx.globalAlpha = 0.08;
      ctx.lineWidth = w * 0.18;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(w * 0.48, 0);
      ctx.bezierCurveTo(w * 0.62, h * 0.25, w * 0.7, h * 0.55, w * 0.55, h * 0.9);
      ctx.stroke();

      ctx.globalAlpha = 1;
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.life += 0.016;
        p.x += p.vx + Math.sin(p.y * 0.04 + i) * 0.15;
        p.y += p.vy;
        // slight cascade curve
        p.vx += 0.012;

        if (p.y > h * 0.92 || p.life > p.max) {
          spawn(p);
          continue;
        }

        const t = p.y / h;
        ctx.fillStyle = t < 0.55 ? primary : cyan;
        ctx.globalAlpha = Math.max(0, 0.85 * (1 - p.life / p.max));
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;

      raf = requestAnimationFrame(tick);
    };

    const onVis = () => {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(raf);
      } else {
        if (!running) {
          running = true;
          raf = requestAnimationFrame(tick);
        }
      }
    };
    document.addEventListener("visibilitychange", onVis);
    raf = requestAnimationFrame(tick);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      className={className}
      aria-hidden
      style={{ width: "100%", height: "100%", display: "block" }}
    />
  );
}
