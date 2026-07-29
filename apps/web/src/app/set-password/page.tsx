"use client";

/**
 * Set / change password while logged in.
 * Identity is re-proven with a one-time email code (existing OTP system).
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { AuroraBackground } from "@/components/AuroraBackground";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Step = "request" | "set";

export default function SetPasswordPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("request");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function requestCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/request-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Failed");
      setDevCode(data.devCode || null);
      setStep("set");
      setMessage(data.message || "Check your email for a code.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/set-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          code,
          password,
          confirmPassword,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Failed");
      try {
        localStorage.setItem("ft_password_prompt_dismissed", "1");
      } catch {
        /* ignore */
      }
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
      <div className="container relative z-10 mx-auto flex min-h-full max-w-md flex-col justify-center px-6 py-12 pb-28">
        <div className="logo mb-6 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.15em] text-primary">
          <span className="logo-dot h-2 w-2 rounded-full bg-primary shadow-[0_0_20px_var(--color-primary)]" />
          FinTrack security
        </div>
        <h1 className="text-3xl font-bold leading-tight tracking-tight">
          Set a password
        </h1>
        <p className="sub mt-3 text-sm leading-relaxed text-muted-foreground">
          We&apos;ll email a one-time code to confirm it&apos;s you. Then you can
          sign in with email + password next time. Email codes still work as
          backup.
        </p>

        <div className="glass-card mt-8 rounded-2xl p-5">
          {step === "request" ? (
            <form onSubmit={requestCode} className="space-y-4">
              <div>
                <Label htmlFor="email">Your account email</Label>
                <Input
                  id="email"
                  className="mt-2"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoFocus
                />
              </div>
              <Button className="w-full" type="submit" disabled={loading}>
                {loading ? "Sending…" : "Send verification code"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => router.push("/dashboard")}
              >
                Not now
              </Button>
            </form>
          ) : (
            <form onSubmit={savePassword} className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Code sent to{" "}
                <strong className="text-foreground">{email}</strong>
              </p>
              {devCode && (
                <div className="dev-code rounded-lg border border-primary/30 bg-primary/10 p-3 text-sm">
                  Dev mode — your code:
                  <strong className="ml-2 font-mono text-primary">
                    {devCode}
                  </strong>
                </div>
              )}
              <div>
                <Label htmlFor="code">6-digit code</Label>
                <Input
                  id="code"
                  className="mt-2 font-mono tracking-widest"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  required
                  placeholder="123456"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  autoFocus
                />
              </div>
              <div>
                <Label htmlFor="password">New password</Label>
                <Input
                  id="password"
                  className="mt-2"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Min 8 characters. A number or symbol is recommended.
                </p>
              </div>
              <div>
                <Label htmlFor="confirm">Confirm password</Label>
                <Input
                  id="confirm"
                  className="mt-2"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  placeholder="Repeat password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>
              <Button className="w-full" type="submit" disabled={loading}>
                {loading ? "Saving…" : "Save password"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => {
                  setStep("request");
                  setCode("");
                  setDevCode(null);
                }}
              >
                Resend code
              </Button>
            </form>
          )}

          {message && !error && (
            <p className="muted mt-4 text-sm text-muted-foreground">{message}</p>
          )}
          {error && (
            <div className="error mt-4 text-sm text-destructive">{error}</div>
          )}
        </div>
      </div>
    </AuroraBackground>
  );
}
