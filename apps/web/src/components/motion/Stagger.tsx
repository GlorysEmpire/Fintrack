"use client";

import { motion, useReducedMotion } from "framer-motion";
import { durations, ease } from "@/lib/motion";

/** Pages that have already played their entrance since the app loaded. */
const played = new Set<string>();

const container = { hidden: {}, show: { transition: { staggerChildren: 0.04 } } };

/** Fades and lifts its StaggerItem children in, 40ms apart, once per page load (M2). */
export function Stagger({
  id,
  className,
  children,
}: {
  /** Names the page so the entrance isn't replayed when you come back to it */
  id: string;
  className?: string;
  children: React.ReactNode;
}) {
  const reduce = useReducedMotion();
  const skip = reduce || played.has(id);
  return (
    <motion.div
      className={className}
      variants={container}
      initial={skip ? false : "hidden"}
      animate="show"
      onAnimationComplete={() => played.add(id)}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      variants={{
        hidden: { opacity: 0, y: reduce ? 0 : 8 },
        show: {
          opacity: 1,
          y: 0,
          transition: { duration: reduce ? 0 : durations.base, ease: ease.out },
        },
      }}
    >
      {children}
    </motion.div>
  );
}
