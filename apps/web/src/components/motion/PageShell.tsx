"use client";

import { usePathname } from "next/navigation";

/** Route-change transition: the page fades in (M11). CSS only, off under reduced motion. */
export function PageShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="ft-page">
      {children}
    </div>
  );
}
