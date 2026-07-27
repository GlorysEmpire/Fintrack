"use client";

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

type GlassCardProps = React.HTMLAttributes<HTMLDivElement> & {
  /** Enable hover lift + glow */
  interactive?: boolean;
  /** Animate entrance */
  motionEnter?: boolean;
};

/**
 * Glassmorphic surface primitive — liquid finance system.
 * Tokens only: --glass-bg, --glass-border, --shadow-glow.
 */
export function GlassCard({
  className,
  interactive = false,
  motionEnter = false,
  children,
  ...props
}: GlassCardProps) {
  const reduce = useReducedMotion();

  const classes = cn(
    "glass-card text-foreground",
    interactive && "glass-card-interactive cursor-default",
    className
  );

  if (motionEnter && !reduce) {
    return (
      <motion.div
        className={classes}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        {...(props as React.ComponentProps<typeof motion.div>)}
      >
        {children}
      </motion.div>
    );
  }

  return (
    <div className={classes} {...props}>
      {children}
    </div>
  );
}
