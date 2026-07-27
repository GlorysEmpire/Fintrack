"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global error]", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          background: "oklch(0.16 0.04 250)",
          color: "oklch(0.98 0.01 240)",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <div
          style={{
            maxWidth: 420,
            width: "100%",
            background: "oklch(0.20 0.05 255)",
            border: "1px solid oklch(1 0 0 / 0.08)",
            borderRadius: 16,
            padding: 28,
          }}
        >
          <p
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "oklch(0.75 0.16 235)",
              marginBottom: 12,
            }}
          >
            FinTrack
          </p>
          <h1 style={{ fontSize: 22, margin: "0 0 8px" }}>
            Something broke
          </h1>
          <p style={{ color: "oklch(0.70 0.03 240)", fontSize: 14, lineHeight: 1.5 }}>
            A critical error occurred. Please try again.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: 20,
              width: "100%",
              padding: 12,
              border: "none",
              borderRadius: 8,
              background: "oklch(0.75 0.16 235)",
              color: "oklch(0.16 0.04 250)",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
