"use client";

/**
 * Soft prompt for OTP-only accounts to set a password.
 * Not forced — dismissible; does not block the dashboard.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

const DISMISS_KEY = "ft_password_prompt_dismissed";

export function SetPasswordPrompt({ hasPassword }: { hasPassword: boolean }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (hasPassword) {
      setVisible(false);
      return;
    }
    try {
      if (localStorage.getItem(DISMISS_KEY) === "1") {
        setVisible(false);
        return;
      }
    } catch {
      /* private mode */
    }
    setVisible(true);
  }, [hasPassword]);

  if (!visible) return null;

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
    setVisible(false);
  }

  return (
    <div
      className="card"
      style={{
        marginBottom: 16,
        borderColor: "color-mix(in oklch, var(--g) 35%, transparent)",
        background:
          "color-mix(in oklch, var(--g) 8%, var(--bg2, transparent))",
      }}
      role="status"
    >
      <div className="card-t" style={{ marginBottom: 6 }}>
        Secure your account
      </div>
      <p style={{ marginBottom: 12, fontSize: 14, lineHeight: 1.45 }}>
        You signed in with an email code. Set a password so you can sign in
        faster next time — email codes still work as a backup.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <Button asChild size="sm">
          <Link href="/set-password">Set password</Link>
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={dismiss}>
          Not now
        </Button>
      </div>
    </div>
  );
}
