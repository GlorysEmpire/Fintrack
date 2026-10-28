"use client";

import { Flame } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";

/**
 * Days in a row something was recorded (M9). It is about keeping the books, not
 * about spending. Shown from 2 days; the flame pulses gently, never under reduced motion.
 */
export function StreakBadge({ days, loggedToday }: { days: number; loggedToday: boolean }) {
  const reduce = useReducedMotion();
  if (days < 2) return null;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2.5 py-1 text-xs font-semibold text-warning"
      title={loggedToday ? "You have logged today" : "Log something today to keep it going"}
    >
      <motion.span
        className="flex"
        animate={reduce ? undefined : { scale: [1, 1.15, 1] }}
        transition={reduce ? undefined : { duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
      >
        <Flame className="h-3.5 w-3.5" aria-hidden />
      </motion.span>
      {days} days in a row
    </span>
  );
}
