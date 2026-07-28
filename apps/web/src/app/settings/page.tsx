/**
 * Plan settings — segmented tabs UI.
 */
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getUserPlan } from "@/lib/plan";
import { emergencyCarryOverCopy } from "@fintrack/domain";
import { unreadCount } from "@/lib/inbox";
import { SettingsClient } from "@/components/SettingsClient";

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
    <SettingsClient
      baseCurrency={user.baseCurrency}
      email={user.email}
      inboxUnread={inboxUnread}
      plan={
        plan
          ? {
              name: plan.name,
              templateId: plan.templateId,
              emergencyCarryOverDefault: plan.emergencyCarryOverDefault,
              buckets: plan.buckets.map((b) => ({
                id: b.id,
                name: b.name,
                emoji: b.emoji,
                percent: b.percent,
                mode: b.mode,
                carryOver: b.carryOver,
                order: b.order,
              })),
            }
          : null
      }
      carryCopy={copy}
    />
  );
}
