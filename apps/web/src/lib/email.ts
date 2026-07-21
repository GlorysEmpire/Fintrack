/**
 * Email delivery for login codes.
 *
 * Production: Resend (https://resend.com) when RESEND_API_KEY is set.
 * Development: logs to server console (and API may return devCode).
 *
 * Env:
 *   RESEND_API_KEY  — required for real email
 *   EMAIL_FROM      — e.g. "FinTrack <login@yourdomain.com>"
 *   AUTH_DEV_SHOW_CODE — "true" only for local testing
 */

export function isDevShowCode(): boolean {
  // Never expose codes in production even if misconfigured
  if (process.env.NODE_ENV === "production") return false;
  return process.env.AUTH_DEV_SHOW_CODE === "true";
}

export async function sendLoginCodeEmail(opts: {
  to: string;
  code: string;
}): Promise<{ sent: boolean; provider: "resend" | "console" }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from =
    process.env.EMAIL_FROM?.trim() || "FinTrack <onboarding@resend.dev>";

  if (!apiKey) {
    console.log(
      `\n📧 [console] FinTrack login code for ${opts.to}: ${opts.code}\n` +
        `   (Set RESEND_API_KEY to send real email)\n`
    );
    return { sent: false, provider: "console" };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [opts.to],
      subject: `${opts.code} is your FinTrack login code`,
      text: [
        `Your FinTrack login code is: ${opts.code}`,
        ``,
        `It expires in 10 minutes.`,
        `If you didn't request this, you can ignore this email.`,
      ].join("\n"),
      html: `
        <div style="font-family:system-ui,sans-serif;max-width:420px;margin:0 auto;padding:24px">
          <p style="font-size:14px;color:#555">Your FinTrack login code</p>
          <p style="font-size:32px;font-weight:700;letter-spacing:0.2em;color:#0f0f0f">${opts.code}</p>
          <p style="font-size:13px;color:#888">Expires in 10 minutes. If you didn't request this, ignore this email.</p>
        </div>
      `,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error("Resend error:", res.status, body);
    // Fall back to console so local/prod debugging still works
    console.log(`\n📧 [fallback] FinTrack login code for ${opts.to}: ${opts.code}\n`);
    throw new Error("Failed to send login email. Try again shortly.");
  }

  return { sent: true, provider: "resend" };
}
