"use client";

/**
 * FIRST-LAUNCH ONBOARDING
 *
 * 1) Choose plan path (default / templates / skip)
 * 2) After a template is chosen: demo preview of ₦100,000 waterfall split
 *    (UI only — never written as real balances)
 * 3) Continue, Skip demo, or auto-advance ~8s → save plan → dashboard
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ALL_TEMPLATES,
  allocateWaterfall,
  formatMoney,
  type CurrencyCode,
} from "@fintrack/domain";
import { AuroraBackground } from "@/components/AuroraBackground";
import { bucketColor } from "@/lib/bucket-colors";

type View = "choose" | "templates" | "demo";

const DEMO_GROSS = 100_000;
const DEMO_CURRENCY: CurrencyCode = "NGN";
/** Auto-continue after this many ms (between 7–10s as specified) */
const DEMO_AUTO_MS = 8_000;

export default function OnboardingPage() {
  const router = useRouter();
  const [view, setView] = useState<View>("choose");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  /** Pending onboarding body after user picks a template (demo step) */
  const [pendingBody, setPendingBody] = useState<Record<string, unknown> | null>(
    null
  );
  const [pendingTemplateId, setPendingTemplateId] = useState<string | null>(
    null
  );
  const [secondsLeft, setSecondsLeft] = useState(
    Math.ceil(DEMO_AUTO_MS / 1000)
  );

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

  const goToDashboard = useCallback(() => {
    if (!pendingBody || loading) return;
    void finish(pendingBody);
  }, [pendingBody, loading, finish]);

  // Auto-advance timer on demo view
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
      goToDashboard();
    }, DEMO_AUTO_MS);

    return () => {
      window.clearInterval(tick);
      window.clearTimeout(auto);
    };
  }, [view, pendingBody, loading, goToDashboard]);

  return (
    <AuroraBackground>
      <div className="container relative z-10 mx-auto max-w-lg px-6 py-12">
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
              onClick={() => finish({ path: "skip" })}
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
                Go straight to the dashboard. No waterfall until you set a plan.
              </p>
            </button>
          </>
        )}

        {view === "templates" && (
          <>
            <h1>Pick a starting template</h1>
            <p className="sub">
              Next you&apos;ll see a short demo of how ₦100,000 would split.
              Nothing is saved until you continue.
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

            {/* Progress bar for auto-advance */}
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
              {loading
                ? "Opening your dashboard…"
                : `Opening dashboard in ${secondsLeft}s · or continue now`}
            </p>

            <button
              type="button"
              className="btn btn-primary"
              disabled={loading}
              onClick={goToDashboard}
              style={{ width: "100%", marginBottom: 8 }}
            >
              {loading ? "Saving…" : "Continue to dashboard"}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={loading}
              onClick={goToDashboard}
              style={{ width: "100%" }}
            >
              Skip demo
            </button>
          </>
        )}

        {error && <div className="error">{error}</div>}
        {loading && view !== "demo" && (
          <p className="muted" style={{ marginTop: 16 }}>
            Saving…
          </p>
        )}
      </div>
    </AuroraBackground>
  );
}
