"use client";

/**
 * FIRST-LAUNCH ONBOARDING
 *
 * Three product paths (all optional except being logged in):
 *  A) Use recommended default (tithe-first)
 *  B) Pick another template
 *  C) Skip — go to dashboard with no plan (arrange later in Settings)
 *
 * "Custom from scratch" editor ships next; for now templates + Settings cover it.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { AuroraBackground } from "@/components/AuroraBackground";

type Path = "choose" | "templates";

export default function OnboardingPage() {
  const router = useRouter();
  const [view, setView] = useState<Path>("choose");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(body: Record<string, unknown>) {
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
    } finally {
      setLoading(false);
    }
  }

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
            proven default, or skip and just log money — you can arrange the
            plan later in Settings.
          </p>

          {/* Path A: recommended default */}
          <button
            type="button"
            className="option"
            disabled={loading}
            onClick={() =>
              submit({ path: "default", templateId: "tithe_first" })
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

          {/* Path B: other templates */}
          <button
            type="button"
            className="option"
            disabled={loading}
            onClick={() => setView("templates")}
          >
            <h3>Choose another template</h3>
            <p>Pay-yourself-first, 50/30/20, or start from a simple split.</p>
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
              Full bucket builder comes next.
            </p>
          </button>

          {/* Path C: skip entirely */}
          <button
            type="button"
            className="option"
            disabled={loading}
            onClick={() => submit({ path: "skip" })}
          >
            <span
              className="tag"
              style={{ color: "var(--y)", background: "#f5c84218" }}
            >
              Optional skip
            </span>
            <h3>Skip for now — just log income</h3>
            <p>
              Go straight to the dashboard. No waterfall until you set a plan.
              Perfect if you want to capture money first and arrange later.
            </p>
          </button>
        </>
      )}

      {view === "templates" && (
        <>
          <h1>Pick a starting template</h1>
          <p className="sub">
            You can edit every bucket and percentage in Settings.
          </p>

          <button
            type="button"
            className="option"
            disabled={loading}
            onClick={() =>
              submit({ path: "template", templateId: "tithe_first" })
            }
          >
            <h3>✝️ Tithe-first waterfall</h3>
            <p>Faith-aligned ordered plan with emergency carry-over.</p>
          </button>
          <button
            type="button"
            className="option"
            disabled={loading}
            onClick={() =>
              submit({ path: "template", templateId: "pay_yourself_first" })
            }
          >
            <h3>📈 Pay yourself first</h3>
            <p>
              Emergency, invest, save, give, then living — flat split of income.
            </p>
          </button>
          <button
            type="button"
            className="option"
            disabled={loading}
            onClick={() => submit({ path: "template", templateId: "50_30_20" })}
          >
            <h3>🏠 50 / 30 / 20</h3>
            <p>Needs, wants, savings &amp; debt — simple and popular.</p>
          </button>

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

      {error && <div className="error">{error}</div>}
      {loading && (
        <p className="muted" style={{ marginTop: 16 }}>
          Saving…
        </p>
      )}
    </div>
    </AuroraBackground>
  );
}
