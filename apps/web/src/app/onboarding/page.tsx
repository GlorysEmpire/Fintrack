"use client";

/**
 * FIRST-LAUNCH ONBOARDING
 *
 * 1) Choose plan path (default / templates / skip)
 * 2) After a template is chosen: demo preview of ₦100,000 waterfall split
 *    (UI only — never written as real balances or sources)
 * 3) Income sources: opt-in generic presets and/or custom — or skip (zero sources)
 * 4) Continue → save plan + chosen sources → dashboard
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ALL_TEMPLATES,
  allocateWaterfall,
  formatMoney,
  type CurrencyCode,
} from "@fintrack/domain";
import { AuroraBackground } from "@/components/AuroraBackground";
import { bucketColor } from "@/lib/bucket-colors";
import { GENERIC_INCOME_PRESETS } from "@/lib/income-presets";

type View = "choose" | "templates" | "demo" | "sources";

const DEMO_GROSS = 100_000;
const DEMO_CURRENCY: CurrencyCode = "NGN";
/** Auto-continue after this many ms (between 7–10s as specified) */
const DEMO_AUTO_MS = 8_000;

const CURRENCIES: CurrencyCode[] = ["NGN", "USD", "GBP", "EUR"];

type CustomDraft = {
  name: string;
  emoji: string;
  type: string;
  currency: CurrencyCode;
  amount: string;
};

export default function OnboardingPage() {
  const router = useRouter();
  const [view, setView] = useState<View>("choose");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  /** Pending onboarding body after user picks a plan (before sources) */
  const [pendingBody, setPendingBody] = useState<Record<string, unknown> | null>(
    null
  );
  const [pendingTemplateId, setPendingTemplateId] = useState<string | null>(
    null
  );
  const [secondsLeft, setSecondsLeft] = useState(
    Math.ceil(DEMO_AUTO_MS / 1000)
  );

  // Sources step (user-owned only)
  const [selectedPresets, setSelectedPresets] = useState<string[]>([]);
  const [customDrafts, setCustomDrafts] = useState<CustomDraft[]>([]);
  const [customName, setCustomName] = useState("");
  const [customEmoji, setCustomEmoji] = useState("💵");
  const [customCurrency, setCustomCurrency] = useState<CurrencyCode>("NGN");
  const actionsRef = useRef<HTMLDivElement | null>(null);

  const demoLines = useMemo(() => {
    if (!pendingTemplateId) return null;
    const tpl = ALL_TEMPLATES.find((t) => t.id === pendingTemplateId);
    if (!tpl) return null;
    const result = allocateWaterfall(DEMO_GROSS, {
      buckets: tpl.plan.buckets,
    });
    return { name: tpl.name, result };
  }, [pendingTemplateId]);

  const finish = useCallback(
    async (body: Record<string, unknown>) => {
      setError(null);
      setLoading(true);
      try {
        const res = await fetch("/api/onboarding", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!data.ok) throw new Error(data.error || "Failed");
        router.push("/dashboard");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
        setLoading(false);
      }
    },
    [router]
  );

  /** User chose a plan → show demo preview (no API write yet) */
  function choosePlan(body: Record<string, unknown>, templateId: string) {
    setPendingBody(body);
    setPendingTemplateId(templateId);
    setSecondsLeft(Math.ceil(DEMO_AUTO_MS / 1000));
    setView("demo");
    setError(null);
  }

  /** After plan (or skip) → income sources step */
  function goToSources(body?: Record<string, unknown>) {
    if (body) setPendingBody(body);
    setView("sources");
    setError(null);
  }

  function togglePreset(id: string) {
    setSelectedPresets((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function addCustomSource() {
    const name = customName.trim();
    if (!name) return;
    setCustomDrafts((prev) => [
      ...prev,
      {
        name,
        emoji: customEmoji.trim() || "💵",
        type: "other",
        currency: customCurrency,
        amount: "0",
      },
    ]);
    setCustomName("");
    setCustomEmoji("💵");
  }

  function buildSourcesPayload() {
    return {
      presetIds: selectedPresets,
      customSources: customDrafts.map((c) => ({
        name: c.name,
        emoji: c.emoji,
        type: c.type,
        currency: c.currency,
        amount: parseFloat(c.amount) || 0,
      })),
    };
  }

  const completeOnboarding = useCallback(
    (sourcesOverride?: { presetIds: string[]; customSources: unknown[] }) => {
      if (!pendingBody || loading) return;
      const sources = sourcesOverride ?? buildSourcesPayload();
      void finish({ ...pendingBody, ...sources });
    },
    // buildSourcesPayload is local and reads latest state via override when needed
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pendingBody, loading, finish, selectedPresets, customDrafts]
  );

  // Auto-advance timer on demo view → sources (not dashboard)
  useEffect(() => {
    if (view !== "demo" || !pendingBody || loading) return;

    const started = Date.now();
    const tick = window.setInterval(() => {
      const left = Math.max(
        0,
        Math.ceil((DEMO_AUTO_MS - (Date.now() - started)) / 1000)
      );
      setSecondsLeft(left);
    }, 250);

    const auto = window.setTimeout(() => {
      goToSources();
    }, DEMO_AUTO_MS);

    return () => {
      window.clearInterval(tick);
      window.clearTimeout(auto);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, pendingBody, loading]);

  // Long steps: keep sticky actions reachable; gently scroll actions into view
  useEffect(() => {
    if (view !== "demo" && view !== "sources") return;
    const id = window.requestAnimationFrame(() => {
      actionsRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
    return () => window.cancelAnimationFrame(id);
  }, [view]);

  return (
    <AuroraBackground>
      <div className="container relative z-10 mx-auto max-w-lg px-6 pt-12 pb-28">
        <div className="logo">
          <span className="logo-dot" /> FinTrack setup
        </div>

        {view === "choose" && (
          <>
            <h1>How do you want to start?</h1>
            <p className="sub">
              Everyone&apos;s budget plan is different. Set yours now, use a
              proven default, or skip and just log money. You can arrange the
              plan later in Settings.
            </p>

            <button
              type="button"
              className="option"
              disabled={loading}
              onClick={() =>
                choosePlan(
                  { path: "default", templateId: "tithe_first" },
                  "tithe_first"
                )
              }
            >
              <span className="tag">Recommended default</span>
              <h3>Use tithe-first waterfall</h3>
              <p>
                10% tithe of gross → emergency → then invest / give / save /
                spend. Emergency balance carries over by default. You can change
                everything later.
              </p>
            </button>

            <button
              type="button"
              className="option"
              disabled={loading}
              onClick={() => setView("templates")}
            >
              <h3>Choose another template</h3>
              <p>Pay yourself first, 50/30/20, or start from a simple split.</p>
            </button>

            <button
              type="button"
              className="option"
              disabled={loading}
              onClick={() => setView("templates")}
            >
              <h3>I&apos;ll customize in Settings</h3>
              <p>
                Pick a template close to your style, then fine-tune in Settings.
              </p>
            </button>

            <button
              type="button"
              className="option"
              disabled={loading}
              onClick={() => goToSources({ path: "skip" })}
            >
              <span
                className="tag"
                style={{
                  color: "var(--y)",
                  background:
                    "color-mix(in oklch, var(--y) 12%, transparent)",
                }}
              >
                Optional skip
              </span>
              <h3>Skip for now · just log income</h3>
              <p>
                No waterfall until you set a plan. You&apos;ll still choose
                income sources next (or skip those too).
              </p>
            </button>
          </>
        )}

        {view === "templates" && (
          <>
            <h1>Pick a starting template</h1>
            <p className="sub">
              Next you&apos;ll see a short demo of how ₦100,000 would split.
              Nothing is saved until you finish setup.
            </p>

            {ALL_TEMPLATES.map((tpl) => (
              <button
                key={tpl.id}
                type="button"
                className="option"
                disabled={loading}
                onClick={() =>
                  choosePlan(
                    { path: "template", templateId: tpl.id },
                    tpl.id
                  )
                }
              >
                <h3>
                  {tpl.plan.buckets[0]?.emoji} {tpl.name}
                </h3>
                <p>{tpl.description}</p>
              </button>
            ))}

            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setView("choose")}
              disabled={loading}
            >
              ← Back
            </button>
          </>
        )}

        {view === "demo" && demoLines && (
          <>
            <h1>Here&apos;s your split preview</h1>
            <p className="sub">
              Demo only: how{" "}
              <strong style={{ color: "var(--tx)" }}>
                {formatMoney(DEMO_GROSS, DEMO_CURRENCY)}
              </strong>{" "}
              of income would flow through{" "}
              <strong style={{ color: "var(--tx)" }}>{demoLines.name}</strong>.
              Your real dashboard starts at zero until you log income.
            </p>

            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-t">Demo waterfall · ₦100,000</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                {demoLines.result.lines.map((line, i) => (
                  <div className="wf-row" key={line.bucketId}>
                    <div
                      className="wf-dot"
                      style={{ background: bucketColor(line.bucketId, i) }}
                    />
                    <div style={{ flex: 1 }}>
                      <div className="wf-name">
                        {line.emoji} {line.name}
                      </div>
                      <div className="wf-rule">
                        {line.percentOfGross.toFixed(1)}% of demo gross
                      </div>
                    </div>
                    <div className="wf-right">
                      <div
                        className="wf-amt"
                        style={{ color: bucketColor(line.bucketId, i) }}
                      >
                        {formatMoney(line.allocated, DEMO_CURRENCY)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div
              style={{
                height: 4,
                background: "var(--bg3)",
                borderRadius: 2,
                overflow: "hidden",
                marginBottom: 8,
              }}
              aria-hidden
            >
              <div
                style={{
                  height: "100%",
                  width: `${((DEMO_AUTO_MS / 1000 - secondsLeft) /
                    (DEMO_AUTO_MS / 1000)) *
                    100}%`,
                  background: "var(--g)",
                  transition: "width 0.25s linear",
                }}
              />
            </div>
            <p className="muted" style={{ fontSize: 12, marginBottom: 16 }}>
              Next: income sources in {secondsLeft}s · or continue now
            </p>

            <div
              ref={actionsRef}
              className="sticky bottom-0 z-20 -mx-6 mt-4 border-t border-white/10 px-6 pt-3"
              style={{
                paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))",
                background:
                  "linear-gradient(to top, oklch(0.12 0.02 160) 70%, transparent)",
              }}
            >
              <button
                type="button"
                className="btn btn-primary"
                disabled={loading}
                onClick={() => goToSources()}
                style={{ width: "100%", marginBottom: 8 }}
              >
                Continue
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={loading}
                onClick={() => goToSources()}
                style={{ width: "100%" }}
              >
                Skip demo
              </button>
            </div>
          </>
        )}

        {view === "sources" && (
          <>
            <h1>Where does your income come from?</h1>
            <p className="sub">
              Optional. Pick common sources, add your own, or skip entirely.
              Nothing is invented for you — empty is fine.
            </p>

            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-t">Common sources</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {GENERIC_INCOME_PRESETS.map((p) => {
                  const on = selectedPresets.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      className="option"
                      disabled={loading}
                      onClick={() => togglePreset(p.id)}
                      style={{
                        margin: 0,
                        textAlign: "left",
                        borderColor: on
                          ? "color-mix(in oklch, var(--g) 50%, transparent)"
                          : undefined,
                        background: on
                          ? "color-mix(in oklch, var(--g) 10%, transparent)"
                          : undefined,
                      }}
                    >
                      <h3 style={{ margin: 0, fontSize: 15 }}>
                        {on ? "✓ " : ""}
                        {p.emoji} {p.name}
                      </h3>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-t">Add custom</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input
                  className="minp"
                  placeholder="Name (e.g. Side hustle)"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  style={{ flex: 2, minWidth: 120 }}
                  disabled={loading}
                />
                <input
                  className="minp"
                  placeholder="💵"
                  value={customEmoji}
                  onChange={(e) => setCustomEmoji(e.target.value)}
                  style={{ width: 56 }}
                  disabled={loading}
                  maxLength={4}
                  aria-label="Emoji"
                />
                <select
                  className="minp"
                  value={customCurrency}
                  onChange={(e) =>
                    setCustomCurrency(e.target.value as CurrencyCode)
                  }
                  disabled={loading}
                >
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={addCustomSource}
                  disabled={loading || !customName.trim()}
                >
                  Add
                </button>
              </div>
              {customDrafts.length > 0 && (
                <ul style={{ marginTop: 12, paddingLeft: 18 }}>
                  {customDrafts.map((c, i) => (
                    <li key={`${c.name}-${i}`} style={{ marginBottom: 6 }}>
                      {c.emoji} {c.name} · {c.currency}{" "}
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{
                          display: "inline",
                          padding: "0 6px",
                          fontSize: 12,
                        }}
                        onClick={() =>
                          setCustomDrafts((prev) =>
                            prev.filter((_, j) => j !== i)
                          )
                        }
                        disabled={loading}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <p className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
              Selected:{" "}
              {selectedPresets.length + customDrafts.length === 0
                ? "none (you can add later on Income)"
                : `${selectedPresets.length + customDrafts.length} source(s)`}
            </p>

            <div
              ref={actionsRef}
              className="sticky bottom-0 z-20 -mx-6 mt-4 border-t border-white/10 px-6 pt-3"
              style={{
                paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))",
                background:
                  "linear-gradient(to top, oklch(0.12 0.02 160) 70%, transparent)",
              }}
            >
              <button
                type="button"
                className="btn btn-primary"
                disabled={loading}
                onClick={() => completeOnboarding()}
                style={{ width: "100%", marginBottom: 8 }}
              >
                {loading
                  ? "Saving…"
                  : selectedPresets.length + customDrafts.length === 0
                    ? "Continue with no sources"
                    : "Save sources & continue"}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={loading}
                onClick={() =>
                  completeOnboarding({ presetIds: [], customSources: [] })
                }
                style={{ width: "100%" }}
              >
                Skip · zero sources
              </button>
            </div>
          </>
        )}

        {error && <div className="error">{error}</div>}
        {loading && view !== "demo" && view !== "sources" && (
          <p className="muted" style={{ marginTop: 16 }}>
            Saving…
          </p>
        )}
      </div>
    </AuroraBackground>
  );
}
