"use client";

/**
 * Settings — segmented tabs: Account | Plan | Appearance (UI PR7).
 */
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { GlassCard } from "@/components/GlassCard";
import { TemplatePicker } from "@/components/TemplatePicker";
import { EmergencyCarryOverToggle } from "@/components/EmergencyCarryOverToggle";
import { ThemeToggle } from "@/components/ThemeToggle";
import { cn } from "@/lib/utils";

type Bucket = {
  id: string;
  name: string;
  emoji: string;
  percent: number;
  mode: string;
  carryOver: boolean;
  order: number;
};

type Plan = {
  name: string;
  templateId?: string;
  buckets: Bucket[];
  emergencyCarryOverDefault: boolean;
} | null;

const TABS = [
  { id: "account", label: "Account" },
  { id: "plan", label: "Plan" },
  { id: "appearance", label: "Appearance" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function SettingsClient({
  baseCurrency,
  email,
  inboxUnread,
  plan,
  carryCopy,
}: {
  baseCurrency: string;
  email: string;
  inboxUnread: number;
  plan: Plan;
  carryCopy: { title: string; body: string; example: string };
}) {
  const [tab, setTab] = useState<TabId>("plan");
  const carryOn = plan?.emergencyCarryOverDefault ?? true;

  return (
    <AppShell baseCurrency={baseCurrency} email={email} inboxUnread={inboxUnread}>
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-4">
        <div>
          <h1 className="font-display text-3xl tracking-tight">Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Account, budget plan, and theme.
          </p>
        </div>

        <div
          role="tablist"
          aria-label="Settings sections"
          className="flex gap-1 rounded-full border border-border bg-[color-mix(in_oklab,var(--surface-1)_50%,transparent)] p-1 backdrop-blur-md"
        >
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              id={`tab-${t.id}`}
              onClick={() => setTab(t.id)}
              className={cn(
                "flex-1 rounded-full px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                tab === t.id
                  ? "bg-primary/20 text-primary shadow-[var(--shadow-glow)]"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "account" && (
          <GlassCard
            motionEnter
            className="p-5"
            role="tabpanel"
            aria-labelledby="tab-account"
          >
            <h2 className="text-sm font-semibold">Account</h2>
            <p className="mt-2 text-foreground">{email}</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Login uses email one-time codes. Base currency is in the top bar.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Base currency: <strong>{baseCurrency}</strong>
            </p>
          </GlassCard>
        )}

        {tab === "plan" && (
          <div className="flex flex-col gap-3" role="tabpanel" aria-labelledby="tab-plan">
            {!plan ? (
              <GlassCard motionEnter className="p-5">
                <h2 className="text-sm font-semibold">No plan yet</h2>
                <p className="mt-2 mb-3 text-sm text-muted-foreground">
                  Choose a template to activate the waterfall.
                </p>
                <TemplatePicker />
              </GlassCard>
            ) : (
              <>
                <GlassCard motionEnter className="p-5">
                  <h2 className="text-sm font-semibold">{plan.name}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {plan.buckets.length} buckets
                    {plan.templateId ? ` · from “${plan.templateId}”` : ""}
                  </p>
                  <div className="mt-4 flex flex-col gap-2">
                    {plan.buckets
                      .slice()
                      .sort((a, b) => a.order - b.order)
                      .map((b) => (
                        <div
                          key={b.id}
                          className="flex items-center gap-3 rounded-xl border border-border px-3 py-2"
                        >
                          <span className="text-lg" aria-hidden>
                            {b.emoji}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="font-medium">{b.name}</div>
                            <div className="text-[11px] text-muted-foreground">
                              {b.percent}% · {b.mode.replaceAll("_", " ")}
                              {b.carryOver ? " · carry-over" : ""}
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                </GlassCard>

                <GlassCard motionEnter className="p-5">
                  <h2 className="mb-2 text-sm font-semibold">
                    {carryCopy.title}
                  </h2>
                  <p className="text-sm text-muted-foreground">{carryCopy.body}</p>
                  <p className="example mt-2 text-xs text-muted-foreground">
                    {carryCopy.example}
                  </p>
                  <EmergencyCarryOverToggle
                    initial={carryOn}
                    hasPlan={Boolean(plan)}
                  />
                </GlassCard>

                <GlassCard motionEnter className="p-5">
                  <h2 className="text-sm font-semibold">Switch template</h2>
                  <p className="mb-3 mt-1 text-sm text-muted-foreground">
                    Replaces current buckets with a starting template.
                  </p>
                  <TemplatePicker />
                </GlassCard>
              </>
            )}
          </div>
        )}

        {tab === "appearance" && (
          <GlassCard
            motionEnter
            className="p-5"
            role="tabpanel"
            aria-labelledby="tab-appearance"
          >
            <h2 className="text-sm font-semibold">Theme</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              System, light, or dark — saved for your account when signed in.
            </p>
            <div className="mt-4 flex items-center gap-3">
              <span className="text-sm text-muted-foreground">Preference</span>
              <ThemeToggle />
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              Liquid finance is dark-first; light mode uses the same tokens.
            </p>
          </GlassCard>
        )}
      </div>
    </AppShell>
  );
}
