"use client";

/**
 * Buttons to apply a built-in plan template.
 * Used on Settings (and after skip) so users can set a plan without re-onboarding.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";

const TEMPLATES = [
  { id: "tithe_first", label: "Tithe-first waterfall" },
  { id: "pay_yourself_first", label: "Pay yourself first" },
  { id: "50_30_20", label: "50 / 30 / 20" },
];

export function TemplatePicker() {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function apply(templateId: string) {
    setLoading(templateId);
    setError(null);
    try {
      const res = await fetch("/api/settings/plan", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Failed");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div>
      {TEMPLATES.map((t) => (
        <button
          key={t.id}
          type="button"
          className="btn btn-secondary"
          style={{ marginTop: 8 }}
          disabled={!!loading}
          onClick={() => apply(t.id)}
        >
          {loading === t.id ? "Applying…" : t.label}
        </button>
      ))}
      {error && <div className="error">{error}</div>}
    </div>
  );
}
