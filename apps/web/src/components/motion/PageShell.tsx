"use client";

import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { ease } from "@/lib/motion";

/** Route-change transition: content fades and rises in (M11). */
export function PageShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const reduce = useReducedMotion();
  return (
    <motion.div
      key={pathname}
      initial={{ opacity: 0, y: reduce ? 0 : 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduce ? 0 : 0.2, ease: ease.out }}
    >
      {children}
    </motion.div>
  );
}
