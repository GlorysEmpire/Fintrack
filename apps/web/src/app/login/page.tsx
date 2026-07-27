"use client";

/**
 * LOGIN — email OTP with aurora backdrop.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { AuroraBackground } from "@/components/AuroraBackground";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThemeToggle } from "@/components/ThemeToggle";

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
    <AuroraBackground>
      <div className="absolute right-4 top-4 z-20">
        <ThemeToggle persist={false} />
      </div>
      <div className="container relative z-10 mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
        <div className="logo mb-6 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.15em] text-primary">
          <span className="logo-dot h-2 w-2 rounded-full bg-primary shadow-[var(--shadow-glow)]" />
          FinTrack
        </div>
        <h1 className="font-display text-4xl font-normal leading-tight tracking-tight">
          Your money.
          <br />
          Your rules.
        </h1>
        <p className="sub mt-3 text-sm leading-relaxed text-muted-foreground">
          Sign in with email. We&apos;ll send a one-time code — no password to
          remember.
        </p>

        <div className="glass-card mt-8 rounded-2xl p-5">
          {step === "email" ? (
            <form onSubmit={requestCode} className="space-y-4">
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  className="mt-2"
                  type="email"
                  required
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoFocus
                />
              </div>
              <Button className="w-full" type="submit" disabled={loading}>
                {loading ? "Sending…" : "Send login code"}
              </Button>
            </form>
          ) : (
            <form onSubmit={verify} className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Code sent to{" "}
                <strong className="text-foreground">{email}</strong>
              </p>
              {devCode && (
                <div className="dev-code rounded-lg border border-primary/30 bg-primary/10 p-3 text-sm">
                  Dev mode — your code (also in the terminal):
                  <strong className="ml-2 font-mono text-primary" data-testid="dev-code">
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
              <Button className="w-full" type="submit" disabled={loading}>
                {loading ? "Checking…" : "Sign in"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => {
                  setStep("email");
                  setCode("");
                  setDevCode(null);
                }}
              >
                Use a different email
              </Button>
            </form>
          )}
          {error && (
            <div className="error mt-4 text-sm text-destructive">{error}</div>
          )}
        </div>
      </div>
    </AuroraBackground>
  );
}
