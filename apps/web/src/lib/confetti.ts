import { BUCKET_COLORS } from "./bucket-colors";

const KEY = "ft-confetti-at";
const COOLDOWN_MS = 12 * 60 * 60 * 1000;

/**
 * A short burst in the bucket colours (1.2s), for income logged. Kept rare on
 * purpose: it never plays under reduced motion and at most once every 12 hours
 * on this device. Nothing here is ever used for spending.
 */
export function celebrate(): void {
  if (typeof window === "undefined") return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  try {
    const last = Number(window.localStorage.getItem(KEY) || 0);
    if (Date.now() - last < COOLDOWN_MS) return;
    window.localStorage.setItem(KEY, String(Date.now()));
  } catch {
    /* storage blocked: still celebrate this once */
  }

  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:300";
  const dpr = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    canvas.remove();
    return;
  }
  ctx.scale(dpr, dpr);

  const originX = window.innerWidth / 2;
  const originY = window.innerHeight * 0.65;
  const parts = Array.from({ length: 70 }, (_, i) => {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.6;
    const speed = 5 + Math.random() * 7;
    return {
      x: originX,
      y: originY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: 5 + Math.random() * 5,
      spin: (Math.random() - 0.5) * 0.3,
      rot: Math.random() * Math.PI,
      color: BUCKET_COLORS[i % 6],
    };
  });

  const start = performance.now();
  const frame = (now: number) => {
    const t = (now - start) / 1200;
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    if (t >= 1) {
      canvas.remove();
      return;
    }
    for (const p of parts) {
      p.vy += 0.28;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.spin;
      ctx.save();
      ctx.globalAlpha = 1 - t * t;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.66);
      ctx.restore();
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
