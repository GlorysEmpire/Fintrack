/**
 * Inbox — override coaching + future monthly AI digests.
 */
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { listInbox, unreadCount } from "@/lib/inbox";
import { InboxClient } from "@/components/InboxClient";

export default async function InboxPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.onboarding === "pending") redirect("/onboarding");

  const [messages, unread] = await Promise.all([
    listInbox(user.id),
    unreadCount(user.id),
  ]);

  return (
    <InboxClient
      baseCurrency={user.baseCurrency}
      email={user.email}
      inboxUnread={unread}
      messages={messages.map((m) => ({
        id: m.id,
        kind: m.kind,
        title: m.title,
        body: m.body,
        read: m.read,
        createdAt: m.createdAt.toISOString(),
      }))}
    />
  );
}
