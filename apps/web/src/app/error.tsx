"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app error]", error);
  }, [error]);

  return (
    <div className="ft-boundary">
      <div className="ft-boundary-card">
        <p className="ft-boundary-kicker">Something went wrong</p>
        <h1 className="ft-boundary-title">We hit a snag loading this page</h1>
        <p className="ft-boundary-body">
          Your data is safe. Try again, or head back to the dashboard.
        </p>
        <div className="ft-boundary-actions">
          <button type="button" className="btn btn-primary" onClick={reset}>
            Try again
          </button>
          <Link href="/dashboard" className="btn btn-ghost">
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}
