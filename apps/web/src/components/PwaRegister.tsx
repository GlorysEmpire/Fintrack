"use client";

import { useEffect } from "react";

/**
 * Registers the service worker that makes FinTrack installable and gives it an
 * offline screen. Production only: in development a worker would cache files
 * that change on every save. It caches static files only (see public/sw.js).
 */
export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // Not installable here (private mode, old browser): the site works as normal
    });
  }, []);
  return null;
}
