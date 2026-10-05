"use client";

/**
 * The Plan card on the Plan settings page.
 *
 * Shows the saved plan in plain language. Changing it is a deliberate step:
 * the editor only opens when the user asks for it.
 */
import { useState } from "react";
import {
  LAYER_COPY,
  WATERFALL_LAYERS,
  activeBuckets,
  archivedBuckets,
  bucketLayer,
  bucketRuleLabel,
  bucketUsageCount,
  getTemplate,
  sortBucketsByPlanOrder,
  type BucketUsage,
  type BudgetPlan,
  type CurrencyCode,
} from "@fintrack/domain";
import { PlanEditor } from "./PlanEditor";

export function PlanSettings({
  plan,
  baseCurrency,
  usage,
  hasHistory,
}: {
  plan: BudgetPlan | null;
  baseCurrency: string;
  usage: BucketUsage;
  hasHistory: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const currency = baseCurrency as CurrencyCode;

  if (!plan) {
    return (
      <div className="card">
        <h2>Build your plan</h2>
        <p className="pe-help" style={{ marginBottom: 12 }}>
          You have no plan yet, so income is not being split into buckets. Add
          your own buckets below, or load a template and change it to fit.
        </p>
        <PlanEditor
          plan={null}
          baseCurrency={baseCurrency}
          usage={usage}
          hasHistory={hasHistory}
          mode="settings"
        />
      </div>
    );
  }

  if (editing) {
    return (
      <div className="card">
        <h2 style={{ marginBottom: 12 }}>Edit plan</h2>
        <PlanEditor
          plan={plan}
          baseCurrency={baseCurrency}
          usage={usage}
          hasHistory={hasHistory}
          mode="settings"
          onSaved={() => setEditing(false)}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }

  const active = sortBucketsByPlanOrder(activeBuckets(plan.buckets));
  const archived = archivedBuckets(plan.buckets);
  const template = plan.templateId ? getTemplate(plan.templateId) : undefined;

  return (
    <div className="card">
      <div className="pe-layer-head">
        <h2>{plan.name}</h2>
        <button
          type="button"
          className="btn btn-secondary plan-edit-btn"
          onClick={() => setEditing(true)}
        >
          Edit plan
        </button>
      </div>
      <p className="muted" style={{ marginTop: 4 }}>
        {active.length} {active.length === 1 ? "bucket" : "buckets"} ·{" "}
        {template ? `based on the “${template.name}” template` : "your own plan"}
      </p>

      {WATERFALL_LAYERS.map((layer) => {
        const rows = active.filter((b) => bucketLayer(b) === layer);
        if (rows.length === 0) return null;
        const copy = LAYER_COPY[layer];
        return (
          <div key={layer} style={{ marginTop: 14 }}>
            <div className="pe-layer-head">
              <strong style={{ fontSize: 13 }}>{copy.label}</strong>
              <span className="pe-layer-tag">{copy.tagline}</span>
            </div>
            {rows.map((b) => (
              <div className="wf-row" key={b.id}>
                <span>{b.emoji}</span>
                <div style={{ flex: 1 }}>
                  <strong>{b.name}</strong>
                  <div className="muted">
                    {bucketRuleLabel(b, currency)} ·{" "}
                    {b.carryOver ? "carries over" : "resets each month"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        );
      })}

      {archived.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div className="pe-layer-head">
            <strong style={{ fontSize: 13 }}>Archived</strong>
            <span className="pe-layer-tag">Kept for history</span>
          </div>
          {archived.map((b) => {
            const used = bucketUsageCount(usage, b.id);
            return (
              <div className="wf-row" key={b.id}>
                <span>{b.emoji}</span>
                <div style={{ flex: 1 }}>
                  <strong>{b.name}</strong>
                  <div className="muted">
                    Receives no income · {used}{" "}
                    {used === 1 ? "transaction" : "transactions"} recorded
                    against it
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="pe-help" style={{ marginTop: 14 }}>
        Your balances are always worked out from what you have recorded, using
        this plan. If you change how money is split or carried over, FinTrack
        shows you what that does to your past months and asks you to confirm
        first.
      </p>
    </div>
  );
}
