"use client";

/**
 * PLAN EDITOR — build and change a personal budget plan.
 *
 * The plan is the user's own financial system, not a template: buckets can be
 * created, renamed, reordered, moved between the three waterfall layers
 * (Mandatory, Off the top, Life plan), given a percentage or a fixed amount,
 * set to carry over or reset, and removed or archived.
 *
 * Rules live in the domain, not here: this screen shows validatePlan()'s
 * verdict live and the server checks it again on save. A change that
 * recalculates past months is only saved after the user has seen the
 * before/after and confirmed.
 */
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArrowDown, ArrowUp, Plus, RotateCcw, Trash2 } from "lucide-react";
import {
  ALL_TEMPLATES,
  LAYER_COPY,
  MAX_BUCKET_NAME_LENGTH,
  MAX_PLAN_NAME_LENGTH,
  WATERFALL_LAYERS,
  activeBuckets,
  allocateWaterfall,
  allocationModeFor,
  archivedBuckets,
  balanceChanged,
  bucketLayer,
  bucketRuleLabel,
  bucketUsageCount,
  carryOverCopy,
  draftFromTemplate,
  formatMoney,
  getTemplate,
  hasFixedAmount,
  newBucketId,
  planRulesChanged,
  sortBucketsByPlanOrder,
  validatePlan,
  type BucketUsage,
  type BudgetPlan,
  type CurrencyCode,
  type PlanBucket,
  type PlanChangeImpact,
  type WaterfallLayer,
} from "@fintrack/domain";
import { ConfirmDialog } from "./ConfirmDialog";
import { toast } from "@/components/ui/toast";

export type PlanDraftPayload = {
  name: string;
  templateId: string | null;
  buckets: PlanBucket[];
};

type Props = {
  /** The saved plan being changed, or null when building a first plan */
  plan: BudgetPlan | null;
  baseCurrency: string;
  /** Transactions + recurring rules per bucket id: decides Remove vs Archive */
  usage: BucketUsage;
  /** true when the user has recorded transactions (a rule change then recalculates them) */
  hasHistory: boolean;
  /**
   * "settings": save through the API (with the confirm-before-change step).
   * "onboarding": hand the finished plan back; setup saves it with everything else.
   */
  mode: "settings" | "onboarding";
  onSubmit?: (plan: PlanDraftPayload) => void;
  onSaved?: () => void;
  onCancel?: () => void;
};

/** One bucket as it is being edited: the amount is kept as typed text */
type DraftBucket = {
  id: string;
  name: string;
  emoji: string;
  layer: WaterfallLayer;
  kind: "percent" | "fixed";
  value: string;
  carryOver: boolean;
  archived: boolean;
};

function toDraft(b: PlanBucket): DraftBucket {
  const fixed = hasFixedAmount(b);
  return {
    id: b.id,
    name: b.name,
    emoji: b.emoji,
    layer: bucketLayer(b),
    kind: fixed ? "fixed" : "percent",
    value: String(fixed ? b.fixed : b.percent),
    carryOver: b.carryOver,
    archived: Boolean(b.archived),
  };
}

function draftsOf(buckets: PlanBucket[]): DraftBucket[] {
  return [
    ...sortBucketsByPlanOrder(activeBuckets(buckets)),
    ...archivedBuckets(buckets),
  ].map(toDraft);
}

/** "50,000" → 50000. Empty or unreadable → NaN, which validation reports. */
function parseNumber(text: string): number {
  const cleaned = text.trim().replace(/,/g, "");
  return cleaned === "" ? Number.NaN : Number(cleaned);
}

/**
 * Drafts → plan buckets. The allocation mode is never chosen by hand: it
 * follows from the layer and from percentage vs fixed amount.
 */
function toBuckets(drafts: DraftBucket[]): PlanBucket[] {
  const ordered = [
    ...WATERFALL_LAYERS.flatMap((layer) =>
      drafts.filter((d) => !d.archived && d.layer === layer)
    ),
    ...drafts.filter((d) => d.archived),
  ];
  return ordered.map((d, order) => {
    const fixed = d.kind === "fixed";
    const n = parseNumber(d.value);
    return {
      id: d.id,
      name: d.name,
      emoji: d.emoji,
      layer: d.layer,
      percent: fixed ? 0 : n,
      ...(fixed ? { fixed: n } : {}),
      mode: allocationModeFor(d.layer, fixed),
      carryOver: d.carryOver,
      order,
      ...(d.archived ? { archived: true } : {}),
    };
  });
}

function signedMoney(amount: number, currency: CurrencyCode): string {
  return `${amount < -0.005 ? "−" : ""}${formatMoney(amount, currency)}`;
}

export function PlanEditor({
  plan,
  baseCurrency,
  usage,
  hasHistory,
  mode,
  onSubmit,
  onSaved,
  onCancel,
}: Props) {
  const router = useRouter();
  const currency = baseCurrency as CurrencyCode;

  const [name, setName] = useState(plan?.name ?? "My plan");
  const [templateId, setTemplateId] = useState<string | null>(
    plan?.templateId ?? null
  );
  const [drafts, setDrafts] = useState<DraftBucket[]>(() =>
    plan ? draftsOf(plan.buckets) : []
  );
  /** Field errors appear once the user has tried to save */
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverErrors, setServerErrors] = useState<string[]>([]);
  /** Set while the user is being asked to confirm a history-changing save */
  const [impact, setImpact] = useState<PlanChangeImpact | null>(null);
  /** What was in the editor before a template was loaded (for Undo) */
  const [beforeTemplate, setBeforeTemplate] = useState<{
    name: string;
    templateId: string | null;
    drafts: DraftBucket[];
    loaded: string;
  } | null>(null);

  const buckets = useMemo(() => toBuckets(drafts), [drafts]);
  const validation = useMemo(
    () => validatePlan({ name, buckets }),
    [name, buckets]
  );
  const planErrors = [
    ...new Set(
      validation.issues
        .filter((i) => i.level === "error" && !i.bucketId)
        .map((i) => i.message)
    ),
  ];
  const errorsFor = (id: string) => [
    ...new Set(
      validation.issues
        .filter((i) => i.level === "error" && i.bucketId === id)
        .map((i) => i.message)
    ),
  ];

  const savedIds = new Set((plan?.buckets ?? []).map((b) => b.id));
  /** A saved bucket that history depends on can be archived, not removed */
  const mustArchive = (id: string) =>
    savedIds.has(id) && bucketUsageCount(usage, id) > 0;

  function update(id: string, patch: Partial<DraftBucket>) {
    setServerErrors([]);
    setDrafts((ds) => {
      const next = ds.map((d) => (d.id === id ? { ...d, ...patch } : d));
      // A bucket moved to another layer joins the end of that layer
      if (patch.layer) {
        const i = next.findIndex((d) => d.id === id);
        const [moved] = next.splice(i, 1);
        next.push(moved);
      }
      return next;
    });
  }

  function addBucket(layer: WaterfallLayer) {
    setServerErrors([]);
    setDrafts((ds) => [
      ...ds,
      {
        // Generated, never typed: renaming can not change a bucket's identity
        id: newBucketId([...ds.map((d) => d.id), ...savedIds]),
        name: "",
        emoji: "",
        layer,
        kind: "percent",
        value: "",
        carryOver: false,
        archived: false,
      },
    ]);
  }

  /** Swap with the nearest active bucket in the same layer */
  function move(id: string, direction: -1 | 1) {
    setServerErrors([]);
    setDrafts((ds) => {
      const i = ds.findIndex((d) => d.id === id);
      if (i < 0) return ds;
      let j = i + direction;
      while (
        j >= 0 &&
        j < ds.length &&
        !(ds[j].layer === ds[i].layer && !ds[j].archived)
      ) {
        j += direction;
      }
      if (j < 0 || j >= ds.length) return ds;
      const next = [...ds];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  function removeOrArchive(id: string) {
    setServerErrors([]);
    setDrafts((ds) =>
      mustArchive(id)
        ? ds.map((d) => (d.id === id ? { ...d, archived: true } : d))
        : ds.filter((d) => d.id !== id)
    );
  }

  function loadTemplate(id: string) {
    const template = getTemplate(id);
    if (!template) return;
    const draft = draftFromTemplate(template, plan, usage);
    setBeforeTemplate({ name, templateId, drafts, loaded: template.name });
    setName(draft.name);
    setTemplateId(draft.templateId);
    setDrafts(draftsOf(draft.buckets));
    setServerErrors([]);
  }

  function undoTemplate() {
    if (!beforeTemplate) return;
    setName(beforeTemplate.name);
    setTemplateId(beforeTemplate.templateId);
    setDrafts(beforeTemplate.drafts);
    setBeforeTemplate(null);
  }

  /** The template label only survives while the rules still match that template */
  function payload(): PlanDraftPayload {
    const template = templateId ? getTemplate(templateId) : undefined;
    return {
      name: name.trim(),
      templateId:
        template && !planRulesChanged(template.plan, { buckets })
          ? template.id
          : null,
      buckets,
    };
  }

  async function save(confirmHistoryChange = false) {
    setAttempted(true);
    setServerErrors([]);
    if (!validation.ok) return;

    if (mode === "onboarding") {
      onSubmit?.(payload());
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/settings/plan", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload(),
          // Only ever sent after the user has read the before/after and agreed
          ...(confirmHistoryChange ? { confirmHistoryChange: true } : {}),
        }),
      });
      const data = await res.json();

      if (res.status === 409 && data.needsConfirmation && data.impact) {
        setImpact(data.impact as PlanChangeImpact);
        return;
      }
      if (!data.ok) {
        setImpact(null);
        setServerErrors(
          Array.isArray(data.errors) && data.errors.length
            ? data.errors
            : [data.error || "Could not save the plan."]
        );
        return;
      }

      setImpact(null);
      toast("Plan saved");
      router.refresh();
      onSaved?.();
    } catch {
      setImpact(null);
      setServerErrors(["Could not reach FinTrack. Nothing was saved."]);
    } finally {
      setSaving(false);
    }
  }

  const archived = drafts.filter((d) => d.archived);
  const lifePlanTotal = drafts
    .filter((d) => !d.archived && d.layer === "life_plan" && d.kind === "percent")
    .reduce((sum, d) => sum + (parseNumber(d.value) || 0), 0);
  const lifePlanOk = Math.abs(lifePlanTotal - 100) <= 0.01;
  const mandatoryTotal = drafts
    .filter((d) => !d.archived && d.layer === "mandatory" && d.kind === "percent")
    .reduce((sum, d) => sum + (parseNumber(d.value) || 0), 0);

  return (
    <div className="plan-editor">
      <label className="mlbl" htmlFor="plan-name" style={{ marginTop: 0 }}>
        Plan name
      </label>
      <input
        id="plan-name"
        className="minp"
        value={name}
        maxLength={MAX_PLAN_NAME_LENGTH}
        onChange={(e) => setName(e.target.value)}
      />

      <label className="mlbl" htmlFor="plan-template">
        Start from a template <span className="mlbl-hint">(optional)</span>
      </label>
      <select
        id="plan-template"
        className="minp"
        value=""
        onChange={(e) => loadTemplate(e.target.value)}
      >
        <option value="">Choose a template to load into the editor…</option>
        {ALL_TEMPLATES.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
      <p className="pe-help">
        A template only fills in the editor below. Nothing is saved until you
        press {mode === "onboarding" ? "Use this plan" : "Save plan"}, and you
        can change every bucket first.
      </p>
      {beforeTemplate && (
        <div className="pe-notice" role="status">
          Loaded “{beforeTemplate.loaded}” into the editor. Nothing has been
          saved yet.{" "}
          <button type="button" className="pe-link" onClick={undoTemplate}>
            Undo
          </button>
        </div>
      )}

      {mode === "settings" && plan && hasHistory && (
        <div className="pe-notice" role="note">
          <strong>Before you change the plan:</strong> your bucket balances are
          worked out from everything you have recorded, using this one plan. So
          changing how money is split or carried over recalculates your past
          months too. FinTrack shows you exactly what changes and asks you to
          confirm before anything is saved. Renaming a bucket never changes
          your numbers.
        </div>
      )}

      {WATERFALL_LAYERS.map((layer) => {
        const rows = drafts.filter((d) => !d.archived && d.layer === layer);
        const copy = LAYER_COPY[layer];
        return (
          <section className="pe-layer" key={layer} aria-label={copy.label}>
            <div className="pe-layer-head">
              <h3 className="pe-layer-title">{copy.label}</h3>
              <span className="pe-layer-tag">{copy.tagline}</span>
            </div>
            <p className="pe-layer-sum">{copy.summary}</p>

            {rows.length === 0 && (
              <p className="muted" style={{ marginBottom: 8 }}>
                No buckets here.
                {layer === "life_plan"
                  ? " A plan needs at least one Life plan bucket with a percentage."
                  : " That is fine: this layer is optional."}
              </p>
            )}

            {rows.map((d, index) => {
              const errors = attempted ? errorsFor(d.id) : [];
              const used = bucketUsageCount(usage, d.id);
              const archive = mustArchive(d.id);
              const bucket = buckets.find((b) => b.id === d.id);
              const label = d.name.trim() || "this bucket";
              return (
                <div className="pe-row" key={d.id}>
                  <div className="pe-line">
                    <input
                      className="minp pe-emoji"
                      aria-label={`Emoji for ${label}`}
                      placeholder="🙂"
                      value={d.emoji}
                      maxLength={8}
                      onChange={(e) => update(d.id, { emoji: e.target.value })}
                    />
                    <input
                      className="minp pe-name"
                      aria-label="Bucket name"
                      placeholder="Bucket name (e.g. Rent)"
                      value={d.name}
                      maxLength={MAX_BUCKET_NAME_LENGTH}
                      onChange={(e) => update(d.id, { name: e.target.value })}
                    />
                    <button
                      type="button"
                      className="pe-icon"
                      aria-label={`Move ${label} up`}
                      title="Move up"
                      disabled={index === 0}
                      onClick={() => move(d.id, -1)}
                    >
                      <ArrowUp className="h-4 w-4" aria-hidden />
                    </button>
                    <button
                      type="button"
                      className="pe-icon"
                      aria-label={`Move ${label} down`}
                      title="Move down"
                      disabled={index === rows.length - 1}
                      onClick={() => move(d.id, 1)}
                    >
                      <ArrowDown className="h-4 w-4" aria-hidden />
                    </button>
                  </div>

                  <div className="pe-line">
                    <select
                      className="minp pe-kind"
                      aria-label={`How ${label} is funded`}
                      value={d.kind}
                      onChange={(e) =>
                        update(d.id, {
                          kind: e.target.value as DraftBucket["kind"],
                          value: "",
                        })
                      }
                    >
                      <option value="percent">Percentage</option>
                      <option value="fixed">Fixed amount</option>
                    </select>
                    <input
                      className="minp pe-num"
                      aria-label={
                        d.kind === "fixed"
                          ? `Fixed amount for ${label} in ${baseCurrency}`
                          : `Percentage for ${label}`
                      }
                      inputMode="decimal"
                      placeholder="0"
                      value={d.value}
                      onChange={(e) => update(d.id, { value: e.target.value })}
                    />
                    <span className="pe-unit">
                      {d.kind === "fixed" ? `${baseCurrency} / month` : "%"}
                    </span>
                  </div>

                  <div className="pe-line">
                    <label className="pe-check">
                      <input
                        type="checkbox"
                        checked={d.carryOver}
                        onChange={(e) =>
                          update(d.id, { carryOver: e.target.checked })
                        }
                      />
                      Carries over
                    </label>
                    <select
                      className="minp pe-layer-pick"
                      aria-label={`Layer for ${label}`}
                      value={d.layer}
                      onChange={(e) =>
                        update(d.id, { layer: e.target.value as WaterfallLayer })
                      }
                    >
                      {WATERFALL_LAYERS.map((l) => (
                        <option key={l} value={l}>
                          {LAYER_COPY[l].label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="tx-act tx-act-del"
                      onClick={() => removeOrArchive(d.id)}
                    >
                      {archive ? (
                        <Archive className="h-3.5 w-3.5" aria-hidden />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      )}
                      {archive ? "Archive" : "Remove"}
                    </button>
                  </div>

                  <div className="pe-rule">
                    {bucket && Number.isFinite(parseNumber(d.value))
                      ? `${bucketRuleLabel(bucket, currency)} · ${
                          d.carryOver
                            ? "leftover money carries into next month"
                            : "resets to zero each month"
                        }`
                      : d.kind === "fixed"
                        ? `Enter the amount in ${baseCurrency}.`
                        : "Enter a percentage."}
                    {archive
                      ? ` · Used by ${used} ${
                          used === 1 ? "transaction" : "transactions"
                        }, so it can be archived but not removed.`
                      : ""}
                  </div>
                  {errors.map((message) => (
                    <div className="pe-err" role="alert" key={message}>
                      {message}
                    </div>
                  ))}
                </div>
              );
            })}

            {layer === "mandatory" && mandatoryTotal > 0 && (
              <div
                className={`pe-total ${mandatoryTotal > 100.01 ? "bad" : ""}`}
              >
                Mandatory percentages take {Number(mandatoryTotal.toFixed(2))}%
                of your total income
                {mandatoryTotal > 100.01 ? " — that is more than 100%." : "."}
              </div>
            )}
            {layer === "life_plan" && rows.some((d) => d.kind === "percent") && (
              <div className={`pe-total ${lifePlanOk ? "ok" : "bad"}`}>
                Life plan percentages add up to{" "}
                {Number(lifePlanTotal.toFixed(2))}% of 100%
                {lifePlanOk ? " ✓" : " — they need to add up to exactly 100%."}
              </div>
            )}

            <button
              type="button"
              className="pe-add"
              onClick={() => addBucket(layer)}
            >
              <Plus className="h-4 w-4" aria-hidden />
              Add a bucket to {copy.label}
            </button>
          </section>
        );
      })}

      {archived.length > 0 && (
        <section className="pe-layer" aria-label="Archived buckets">
          <div className="pe-layer-head">
            <h3 className="pe-layer-title">Archived</h3>
            <span className="pe-layer-tag">Kept for history</span>
          </div>
          <p className="pe-layer-sum">
            Archived buckets receive no income and can not be spent from. They
            are kept so the transactions recorded against them keep their name.
          </p>
          {archived.map((d) => {
            const used = bucketUsageCount(usage, d.id);
            return (
              <div className="pe-row" key={d.id}>
                <div className="pe-line">
                  <span className="pe-archived-name">
                    {d.emoji} {d.name}
                  </span>
                  <span className="muted">
                    {used} {used === 1 ? "transaction" : "transactions"}
                  </span>
                  <button
                    type="button"
                    className="tx-act"
                    onClick={() => update(d.id, { archived: false })}
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                    Restore
                  </button>
                  {!mustArchive(d.id) && (
                    <button
                      type="button"
                      className="tx-act tx-act-del"
                      onClick={() => removeOrArchive(d.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      Remove
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </section>
      )}

      <details className="pe-details">
        <summary>Percentage or fixed amount?</summary>
        <p>
          A <strong>percentage</strong> takes a share of your income, so it
          grows and shrinks with what you earn. A <strong>fixed amount</strong>{" "}
          takes the same amount every month (in {baseCurrency}), before the
          percentages in the same layer.
        </p>
        <p>
          Buckets are filled from the top down. If a month&apos;s income is
          less than your fixed amounts, the ones at the top are filled first
          and the ones lower down get less. Use the arrows to choose the order.
        </p>
      </details>
      <details className="pe-details">
        <summary>What does “carries over” mean?</summary>
        {[true, false].map((on) => {
          const copy = carryOverCopy(on);
          return (
            <p key={String(on)}>
              <strong>{copy.title}:</strong> {copy.body} {copy.example}
            </p>
          );
        })}
      </details>

      <PlanPreview buckets={buckets} valid={validation.ok} currency={currency} />

      {attempted && planErrors.length > 0 && (
        <div className="error" role="alert">
          {planErrors.map((message) => (
            <div key={message}>{message}</div>
          ))}
        </div>
      )}
      {attempted && !validation.ok && planErrors.length === 0 && (
        <div className="error" role="alert">
          Fix the problems marked on the buckets above. The plan is not saved
          until it is valid.
        </div>
      )}
      {validation.ok &&
        validation.warnings.map((message) => (
          <div className="friction" role="status" key={message}>
            {message}
          </div>
        ))}
      {serverErrors.length > 0 && (
        <div className="error" role="alert">
          {serverErrors.map((message) => (
            <div key={message}>{message}</div>
          ))}
        </div>
      )}

      <button
        type="button"
        className="btn btn-primary"
        disabled={saving}
        onClick={() => save()}
        style={{ marginTop: 16 }}
      >
        {saving
          ? "Saving…"
          : mode === "onboarding"
            ? "Use this plan"
            : "Save plan"}
      </button>
      {onCancel && (
        <button
          type="button"
          className="btn btn-ghost"
          disabled={saving}
          onClick={onCancel}
        >
          {mode === "onboarding" ? "← Back" : "Cancel (keep my current plan)"}
        </button>
      )}

      <ConfirmDialog
        open={Boolean(impact)}
        onOpenChange={(open) => {
          if (!open) setImpact(null);
        }}
        title="This changes how your past months are calculated"
        confirmLabel="Yes, apply it to my whole history"
        busyLabel="Saving…"
        cancelLabel="Keep my current plan"
        busy={saving}
        onConfirm={() => save(true)}
      >
        {impact && <ImpactDetails impact={impact} currency={currency} />}
      </ConfirmDialog>
    </div>
  );
}

/** How a sample month's income would be split by the plan in the editor */
function PlanPreview({
  buckets,
  valid,
  currency,
}: {
  buckets: PlanBucket[];
  valid: boolean;
  currency: CurrencyCode;
}) {
  const [sample, setSample] = useState("100000");
  const gross = parseNumber(sample);
  const result =
    valid && Number.isFinite(gross) && gross >= 0
      ? allocateWaterfall(gross, { buckets })
      : null;

  return (
    <section className="pe-layer" aria-label="Preview">
      <div className="pe-layer-head">
        <h3 className="pe-layer-title">Preview</h3>
        <span className="pe-layer-tag">Nothing is saved here</span>
      </div>
      <div className="pe-line" style={{ marginTop: 8 }}>
        <label className="pe-check" htmlFor="plan-sample">
          If a month&apos;s income is
        </label>
        <input
          id="plan-sample"
          className="minp pe-num"
          inputMode="decimal"
          value={sample}
          onChange={(e) => setSample(e.target.value)}
        />
        <span className="pe-unit">{currency}</span>
      </div>
      {!result ? (
        <p className="muted" style={{ marginTop: 10 }}>
          The preview appears once the plan has no errors and the income is a
          number.
        </p>
      ) : (
        <div style={{ marginTop: 10 }}>
          {result.lines.map((line) => (
            <div className="pe-preview-row" key={line.bucketId}>
              <span>
                {line.emoji} {line.name}
              </span>
              <span className="font-mono tabular-nums">
                {formatMoney(line.allocated, currency)}{" "}
                <span className="muted">
                  ({Number(line.percentOfGross.toFixed(1))}%)
                </span>
              </span>
            </div>
          ))}
          <p className="muted" style={{ marginTop: 8 }}>
            The plan is applied to each month&apos;s total income, so a fixed
            amount is filled once per month however many payments you receive.
          </p>
        </div>
      )}
    </section>
  );
}

/** The before/after shown before a history-changing plan change is saved */
function ImpactDetails({
  impact,
  currency,
}: {
  impact: PlanChangeImpact;
  currency: CurrencyCode;
}) {
  const months = `${impact.monthsAffected} ${
    impact.monthsAffected === 1 ? "month" : "months"
  }`;
  const transactions = `${impact.transactionCount} ${
    impact.transactionCount === 1 ? "transaction" : "transactions"
  }`;
  const anyBalanceChanges = impact.buckets.some(balanceChanged);

  return (
    <>
      <p>
        FinTrack works out your bucket balances by running everything you have
        recorded through your plan. There is one plan for your whole history,
        so this change applies to <strong>{months}</strong> and{" "}
        <strong>{transactions}</strong> — not only from today.
      </p>

      {impact.changes.length > 0 && (
        <>
          <p>
            <strong>What changes in your plan</strong>
          </p>
          <ul>
            {impact.changes.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </>
      )}

      <p>
        <strong>What each bucket holds today</strong>
      </p>
      <table className="impact-table">
        <thead>
          <tr>
            <th scope="col">Bucket</th>
            <th scope="col">Now</th>
            <th scope="col">After</th>
          </tr>
        </thead>
        <tbody>
          {impact.buckets.map((b) => (
            <tr key={b.bucketId} data-changed={balanceChanged(b)}>
              <th scope="row">
                {b.emoji} {b.name}
              </th>
              <td>{b.before === null ? "—" : signedMoney(b.before, currency)}</td>
              <td>
                {b.after === null ? "not active" : signedMoney(b.after, currency)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!anyBalanceChanges && (
        <p className="muted">
          Today&apos;s balances stay the same, but earlier months are still
          recalculated under the new rules.
        </p>
      )}

      <p>
        <strong>What does not change:</strong> your transactions. Every amount,
        date and note stays exactly as you recorded it. Only the bucket
        balances worked out from them change, and you can change the plan again
        later.
      </p>
    </>
  );
}
