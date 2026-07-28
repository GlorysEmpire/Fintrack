/**
 * Plan settings — under AppShell like the screenshot nav item.
 */
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getUserPlan } from "@/lib/plan";
import { emergencyCarryOverCopy } from "@fintrack/domain";
import { unreadCount } from "@/lib/inbox";
import { EmergencyCarryOverToggle } from "@/components/EmergencyCarryOverToggle";
import { TemplatePicker } from "@/components/TemplatePicker";
import { AppShell } from "@/components/AppShell";

export default async function SettingsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const [plan, inboxUnread] = await Promise.all([
    getUserPlan(user.id),
    unreadCount(user.id),
  ]);
  const carryOn = plan?.emergencyCarryOverDefault ?? true;
  const copy = emergencyCarryOverCopy(carryOn);

  return (
    <AppShell
      baseCurrency={user.baseCurrency}
      email={user.email}
      inboxUnread={inboxUnread}
    >
      <h1 style={{ fontSize: 20, marginBottom: 8 }}>Budget plan</h1>
      <p className="sub">
        Change how income is split. Everyone&apos;s plan can be different.
      </p>

      <div className="card">
        <h2>Account</h2>
        <p style={{ marginTop: 6 }}>{user.email}</p>
        <p className="muted" style={{ marginTop: 4 }}>
          {user.passwordHash
            ? "Sign-in: email + password (email codes still work as backup)."
            : "Sign-in: email code only. Set a password for faster logins."}
        </p>
        <p style={{ marginTop: 12 }}>
          <a href="/set-password" className="btn btn-ghost" style={{ display: "inline-block" }}>
            {user.passwordHash ? "Change password" : "Set password"}
          </a>
        </p>
      </div>

      {!plan ? (
        <div className="card">
          <h2>No plan yet</h2>
          <p style={{ marginBottom: 12 }}>
            Choose a template to activate the waterfall.
          </p>
          <TemplatePicker />
        </div>
      ) : (
        <>
          <div className="card">
            <h2>{plan.name}</h2>
            <p>
              {plan.buckets.length} buckets
              {plan.templateId ? ` · from “${plan.templateId}”` : ""}
            </p>
            <div style={{ marginTop: 12 }}>
              {plan.buckets
                .slice()
                .sort((a, b) => a.order - b.order)
                .map((b) => (
                  <div className="wf-row" key={b.id}>
                    <span>{b.emoji}</span>
                    <div style={{ flex: 1 }}>
                      <strong>{b.name}</strong>
                      <div className="muted">
                        {b.percent}% · {b.mode.replaceAll("_", " ")}
                        {b.carryOver ? " · carry-over" : ""}
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </div>

          <div className="card">
            <h2 style={{ marginBottom: 8 }}>{copy.title}</h2>
            <p>{copy.body}</p>
            <div className="example">{copy.example}</div>
            <EmergencyCarryOverToggle
              initial={carryOn}
              hasPlan={Boolean(plan)}
            />
          </div>

          <div className="card">
            <h2>Switch template</h2>
            <p style={{ marginBottom: 12 }}>
              Replaces current buckets with a starting template.
            </p>
            <TemplatePicker />
          </div>
        </>
      )}
    </AppShell>
  );
}
