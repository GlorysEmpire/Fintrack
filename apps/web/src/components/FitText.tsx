"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/** Never smaller than this share of the size it was given, so it stays readable */
const MIN_SCALE = 0.55;

/**
 * Text that always fits the box it is in, whatever the screen width. It shrinks
 * to fit; if it would have to shrink past readable it switches to the short form
 * (₦1.28M) with the whole number in its title; and as a last resort it is clipped
 * inside the box, never spilling out of it. The box width is watched, so it
 * re-fits as the window or the card changes size.
 */
export function FitText({
  text,
  compact,
  full,
  className,
}: {
  text: string;
  /** The short form to fall back to */
  compact?: string;
  /** The whole value, shown as the title (and read aloud) when the short form is used */
  full?: string;
  className?: string;
}) {
  const box = useRef<HTMLSpanElement>(null);
  const inner = useRef<HTMLSpanElement>(null);
  const [short, setShort] = useState(false);
  const [tick, setTick] = useState(0);

  useLayoutEffect(() => {
    const b = box.current;
    const i = inner.current;
    if (!b || !i) return;
    i.style.fontSize = "1em";
    const avail = b.clientWidth;
    const natural = i.scrollWidth;
    if (avail <= 0 || natural <= 0) return;
    const scale = Math.min(1, avail / natural);
    if (scale < MIN_SCALE && compact && !short) {
      setShort(true);
      return;
    }
    i.style.fontSize = `${Math.max(scale, short ? 0.4 : MIN_SCALE)}em`;
  }, [text, compact, short, tick]);

  useLayoutEffect(() => {
    const b = box.current;
    if (!b || typeof ResizeObserver === "undefined") return;
    let width = b.clientWidth;
    const ro = new ResizeObserver(() => {
      if (Math.abs(b.clientWidth - width) < 1) return;
      width = b.clientWidth;
      setShort(false); // try the whole number again at the new width
      setTick((t) => t + 1);
    });
    ro.observe(b);
    return () => ro.disconnect();
  }, []);

  const shown = short && compact ? compact : text;
  return (
    <span
      ref={box}
      data-fit
      className={cn("block max-w-full overflow-hidden whitespace-nowrap", className)}
      title={short && full ? full : undefined}
      aria-label={short && full ? full : undefined}
    >
      <span ref={inner} className="inline-block">
        {shown}
      </span>
    </span>
  );
}
