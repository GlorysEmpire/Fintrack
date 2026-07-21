"use client";

/**
 * Discreet customize control — screenshot UI stays clean;
 * panel only opens on demand.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  DASHBOARD_SECTIONS,
  type DashboardLayout,
  type DashboardSectionId,
} from "@fintrack/domain";

export function DashboardCustomize({
  layout: initial,
}: {
  layout: DashboardLayout;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [layout, setLayout] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hidden = new Set(layout.hidden);

  async function setVisible(
    id: DashboardSectionId,
    visible: boolean,
    pinned: boolean
  ) {
    if (pinned) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/dashboard/layout", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toggleId: id, visible }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Failed");
      setLayout(data.layout);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="dash-customize">
      <button
        type="button"
        className="btn-customize"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? "Done" : "Customize"}
      </button>

      {open && (
        <div className="card customize-panel" style={{ marginTop: 10 }}>
          <h2 style={{ marginBottom: 6, fontSize: 13 }}>Dashboard sections</h2>
          <p className="muted" style={{ marginBottom: 12 }}>
            Charts and bucket balances stay on. Toggle the rest freely.
          </p>

          {DASHBOARD_SECTIONS.map((s) => {
            const on = s.pinned || !hidden.has(s.id);
            return (
              <label key={s.id} className="customize-row">
                <input
                  type="checkbox"
                  checked={on}
                  disabled={s.pinned || saving}
                  onChange={(e) => setVisible(s.id, e.target.checked, s.pinned)}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>
                    {s.label}
                    {s.pinned && (
                      <span className="pill pill-g" style={{ marginLeft: 8 }}>
                        always on
                      </span>
                    )}
                  </div>
                  <div className="muted">{s.description}</div>
                </div>
              </label>
            );
          })}

          {error && <div className="error">{error}</div>}
        </div>
      )}
    </div>
  );
}
