"use client";

/**
 * Settings toggle for emergency carry-over.
 * Calls PATCH /api/settings/plan with { emergencyCarryOver: boolean }.
 * On failure, reverts the checkbox so the UI stays honest.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";

export function EmergencyCarryOverToggle({
  initial,
  hasPlan,
}: {
  initial: boolean;
  hasPlan: boolean;
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onChange(next: boolean) {
    if (!hasPlan) return;
    setEnabled(next);
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/plan", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emergencyCarryOver: next }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Failed");
      // Re-render server components so copy/title stay in sync
      router.refresh();
    } catch (e) {
      setEnabled(!next);
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ marginTop: 14 }}>
      <label className="toggle-row">
        <input
          type="checkbox"
          checked={enabled}
          disabled={!hasPlan || saving}
          onChange={(e) => onChange(e.target.checked)}
        />
        <div>
          <div style={{ fontWeight: 600 }}>
            Carry over emergency balance
            {saving ? "…" : ""}
          </div>
          <div className="muted">
            {enabled
              ? "On — leftovers roll into next month (recommended)."
              : "Off — emergency resets each month from that month’s income only."}
          </div>
        </div>
      </label>
      {error && <div className="error">{error}</div>}
    </div>
  );
}
