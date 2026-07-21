"use client";

/**
 * LOGIN PAGE (client component)
 * Step 1: enter email → API sends/creates OTP
 * Step 2: enter 6-digit code → session cookie set → onboarding or dashboard
 *
 * Dev mode shows the code on screen so you can test without SMTP.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function requestCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/request-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Failed");
      // Only present when AUTH_DEV_SHOW_CODE=true
      setDevCode(data.devCode || null);
      setStep("code");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Failed");

      // New users start with onboarding === "pending"
      if (data.user.onboarding === "pending") {
        router.push("/onboarding");
      } else {
        router.push("/dashboard");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container">
      <div className="logo">
        <span className="logo-dot" /> FinTrack
      </div>
      <h1>
        Your money.
        <br />
        Your rules.
      </h1>
      <p className="sub">
        Sign in with email. We&apos;ll send a one-time code — no password to
        remember. (2FA authenticator and stronger security come later.)
      </p>

      {step === "email" ? (
        <form onSubmit={requestCode}>
          <div className="label">Email</div>
          <input
            className="input"
            type="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
          />
          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? "Sending…" : "Send login code"}
          </button>
        </form>
      ) : (
        <form onSubmit={verify}>
          <p className="sub" style={{ marginBottom: 12 }}>
            Code sent to <strong style={{ color: "var(--tx)" }}>{email}</strong>
          </p>
          {devCode && (
            <div className="dev-code">
              Dev mode — your code (also in the terminal):
              <strong>{devCode}</strong>
            </div>
          )}
          <div className="label">6-digit code</div>
          <input
            className="input"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            required
            placeholder="123456"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoFocus
          />
          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? "Checking…" : "Sign in"}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setStep("email");
              setCode("");
              setDevCode(null);
            }}
          >
            Use a different email
          </button>
        </form>
      )}

      {error && <div className="error">{error}</div>}
    </div>
  );
}
