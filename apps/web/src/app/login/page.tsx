"use client";

/**
 * LOGIN — primary: email + password
 * Secondary: email OTP (legacy / recovery)
 * Forgot: OTP → set new password
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { AuroraBackground } from "@/components/AuroraBackground";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThemeToggle } from "@/components/ThemeToggle";

type Mode = "password" | "otp" | "forgot" | "signup";
type OtpStep = "email" | "code";
type ForgotStep = "email" | "reset";

function routeAfterAuth(onboarding: string, router: ReturnType<typeof useRouter>) {
  if (onboarding === "pending") {
    router.push("/onboarding");
  } else {
    router.push("/dashboard");
  }
  router.refresh();
}

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("password");

  // Shared
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);

  // Password login
  const [password, setPassword] = useState("");

  // OTP login
  const [otpStep, setOtpStep] = useState<OtpStep>("email");
  const [code, setCode] = useState("");

  // Forgot / set password
  const [forgotStep, setForgotStep] = useState<ForgotStep>("email");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Create account (signup)
  const [signupStep, setSignupStep] = useState<OtpStep>("email");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupConfirm, setSignupConfirm] = useState("");

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setLoading(false);
    setDevCode(null);
    setPassword("");
    setCode("");
    setNewPassword("");
    setConfirmPassword("");
    setOtpStep("email");
    setForgotStep("email");
    setSignupStep("email");
    setSignupPassword("");
    setSignupConfirm("");
  }

  async function loginPassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Failed");
      routeAfterAuth(data.user.onboarding, router);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

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
      if (mode === "forgot") {
        setForgotStep("reset");
      } else if (mode === "signup") {
        setSignupStep("code");
      } else {
        setOtpStep("code");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp(e: React.FormEvent) {
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
      routeAfterAuth(data.user.onboarding, router);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function createAccount(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (signupPassword !== signupConfirm) {
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
          password: signupPassword,
          confirmPassword: signupConfirm,
          intent: "signup",
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Failed");
      routeAfterAuth(data.user.onboarding, router);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function resetPassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirmPassword) {
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
          password: newPassword,
          confirmPassword,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Failed");
      routeAfterAuth(data.user.onboarding, router);
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
      <div className="container relative z-10 mx-auto flex min-h-full max-w-md flex-col justify-center px-6 py-12 pb-28">
        <div className="logo mb-6 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.15em] text-primary">
          <span className="logo-dot h-2 w-2 rounded-full bg-primary shadow-[0_0_20px_var(--color-primary)]" />
          FinTrack
        </div>
        <h1 className="text-3xl font-bold leading-tight tracking-tight">
          {mode === "signup" ? (
            <>Create your FinTrack account</>
          ) : (
            <>
              Your money.
              <br />
              Your rules.
            </>
          )}
        </h1>
        <p className="sub mt-3 text-sm leading-relaxed text-muted-foreground">
          {mode === "password" &&
            "Sign in with email and password. Prefer a code? Use email code below."}
          {mode === "otp" &&
            "We’ll send a one-time code to your email — no password needed."}
          {mode === "forgot" &&
            "Verify your email with a code, then choose a new password."}
          {mode === "signup" &&
            "We’ll email a one-time code to verify your address, then you set your password."}
        </p>

        <div className="glass-card mt-8 rounded-2xl p-5">
          <div className="mb-5 grid grid-cols-2 gap-1 rounded-xl bg-muted/60 p-1">
            <button
              type="button"
              onClick={() => switchMode("password")}
              className={
                mode === "signup"
                  ? "rounded-lg px-3 py-2 text-sm font-semibold text-muted-foreground transition"
                  : "rounded-lg bg-background px-3 py-2 text-sm font-semibold shadow-sm transition"
              }
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => switchMode("signup")}
              className={
                mode === "signup"
                  ? "rounded-lg bg-background px-3 py-2 text-sm font-semibold shadow-sm transition"
                  : "rounded-lg px-3 py-2 text-sm font-semibold text-muted-foreground transition"
              }
            >
              Create account
            </button>
          </div>
          {mode === "password" && (
            <form onSubmit={loginPassword} className="space-y-4">
              <div>
                <Label htmlFor="email">Email</Label>
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
              <div>
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  className="mt-2"
                  type="password"
                  required
                  autoComplete="current-password"
                  placeholder="Your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <Button className="w-full" type="submit" disabled={loading}>
                {loading ? "Signing in…" : "Sign in"}
              </Button>
              <div className="flex flex-col gap-1 pt-1">
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  onClick={() => switchMode("forgot")}
                >
                  Forgot password?
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  onClick={() => switchMode("otp")}
                >
                  Sign in with email code instead
                </Button>
              </div>
            </form>
          )}

          {mode === "otp" && otpStep === "email" && (
            <form onSubmit={requestCode} className="space-y-4">
              <div>
                <Label htmlFor="otp-email">Email</Label>
                <Input
                  id="otp-email"
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
                {loading ? "Sending…" : "Send login code"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => switchMode("password")}
              >
                ← Back to password sign-in
              </Button>
            </form>
          )}

          {mode === "otp" && otpStep === "code" && (
            <form onSubmit={verifyOtp} className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Code sent to{" "}
                <strong className="text-foreground">{email}</strong>
              </p>
              {devCode && (
                <div className="dev-code rounded-lg border border-primary/30 bg-primary/10 p-3 text-sm">
                  Dev mode — your code (also in the terminal):
                  <strong
                    className="ml-2 font-mono text-primary"
                    data-testid="dev-code"
                  >
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
                  setOtpStep("email");
                  setCode("");
                  setDevCode(null);
                }}
              >
                Use a different email
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => switchMode("password")}
              >
                ← Back to password sign-in
              </Button>
            </form>
          )}

          {mode === "forgot" && forgotStep === "email" && (
            <form onSubmit={requestCode} className="space-y-4">
              <div>
                <Label htmlFor="forgot-email">Email</Label>
                <Input
                  id="forgot-email"
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
                onClick={() => switchMode("password")}
              >
                ← Back to sign-in
              </Button>
            </form>
          )}

          {mode === "forgot" && forgotStep === "reset" && (
            <form onSubmit={resetPassword} className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Enter the code sent to{" "}
                <strong className="text-foreground">{email}</strong> and choose
                a new password.
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
                <Label htmlFor="forgot-code">6-digit code</Label>
                <Input
                  id="forgot-code"
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
                <Label htmlFor="new-password">New password</Label>
                <Input
                  id="new-password"
                  className="mt-2"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Min 8 characters. A number or symbol is recommended.
                </p>
              </div>
              <div>
                <Label htmlFor="confirm-password">Confirm password</Label>
                <Input
                  id="confirm-password"
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
                {loading ? "Saving…" : "Save password & sign in"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => switchMode("password")}
              >
                ← Back to sign-in
              </Button>
            </form>
          )}

          {mode === "signup" && signupStep === "email" && (
            <form onSubmit={requestCode} className="space-y-4">
              <div>
                <Label htmlFor="signup-email">Email</Label>
                <Input
                  id="signup-email"
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
                onClick={() => switchMode("password")}
              >
                ← Back to sign-in
              </Button>
            </form>
          )}

          {mode === "signup" && signupStep === "code" && (
            <form onSubmit={createAccount} className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Code sent to{" "}
                <strong className="text-foreground">{email}</strong>. Verify it
                and choose your password.
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
                <Label htmlFor="signup-code">6-digit code</Label>
                <Input
                  id="signup-code"
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
                <Label htmlFor="signup-password">Password</Label>
                <Input
                  id="signup-password"
                  className="mt-2"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                  value={signupPassword}
                  onChange={(e) => setSignupPassword(e.target.value)}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Min 8 characters. A number or symbol is recommended.
                </p>
              </div>
              <div>
                <Label htmlFor="signup-confirm">Confirm password</Label>
                <Input
                  id="signup-confirm"
                  className="mt-2"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  placeholder="Repeat password"
                  value={signupConfirm}
                  onChange={(e) => setSignupConfirm(e.target.value)}
                />
              </div>
              <Button className="w-full" type="submit" disabled={loading}>
                {loading ? "Creating account…" : "Create account"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => {
                  setSignupStep("email");
                  setCode("");
                  setDevCode(null);
                }}
              >
                Use a different email
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => switchMode("password")}
              >
                ← Back to sign-in
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
