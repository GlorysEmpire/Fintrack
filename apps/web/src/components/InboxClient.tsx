"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Inbox } from "lucide-react";
import { AppShell } from "./AppShell";
import { EmptyState } from "./EmptyState";
import { formatTxDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import { PageHeader } from "./PageHeader";

type Msg = {
  id: string;
  kind: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
};

export function InboxClient({
  baseCurrency,
  email,
  name,
  inboxUnread,
  messages: initial,
}: {
  baseCurrency: string;
  email: string;
  name?: string | null;
  inboxUnread: number;
  messages: Msg[];
}) {
  const router = useRouter();
  const [messages, setMessages] = useState(initial);

  async function markRead(id: string) {
    await fetch("/api/inbox", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setMessages((ms) =>
      ms.map((m) => (m.id === id ? { ...m, read: true } : m))
    );
    router.refresh();
  }

  async function markAll() {
    await fetch("/api/inbox", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    });
    setMessages((ms) => ms.map((m) => ({ ...m, read: true })));
    router.refresh();
  }

  return (
    <AppShell
      baseCurrency={baseCurrency}
      email={email}
      name={name}
      inboxUnread={inboxUnread}
    >
      <PageHeader
        title="Inbox"
        infoLabel="About the Inbox"
        info="Accountability from FinTrack Steward, especially when you spend past the plan."
      >
        {messages.some((m) => !m.read) && (
          <button type="button" className="btn btn-secondary !mt-0 !w-auto px-3.5 py-2" onClick={markAll}>
            Mark all read
          </button>
        )}
      </PageHeader>

      {messages.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={Inbox}
            title="Inbox is clear"
            description="When you spend from a bucket on something outside its purpose, Steward writes you here."
          />
        </div>
      ) : (
        messages.map((m, i) => (
          <div
            key={m.id}
            className={cn("card transition-[border-color,opacity] duration-500", m.read ? "opacity-85" : "border-primary")}
            style={{ transitionDelay: `${i * 40}ms` }}
          >
            <div className="mb-2 flex justify-between gap-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                {!m.read && <span className="unread-dot h-2.5 w-2.5 shrink-0 rounded-full bg-primary" aria-label="Unread" role="img" />}
                {m.title}
              </h2>
              <span className="whitespace-nowrap text-xs text-muted-foreground">{formatTxDate(m.createdAt)}</span>
            </div>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{m.body}</p>
            {!m.read && (
              <button type="button" className="btn btn-ghost" style={{ marginTop: 10 }} onClick={() => markRead(m.id)}>
                Mark read
              </button>
            )}
          </div>
        ))
      )}
    </AppShell>
  );
}
