"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AppShell } from "./AppShell";
import { formatTxDate } from "@/lib/format-date";

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
  inboxUnread,
  messages: initial,
}: {
  baseCurrency: string;
  email: string;
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
      inboxUnread={inboxUnread}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <div>
          <h1 style={{ fontSize: 20, marginBottom: 4 }}>Inbox</h1>
          <p className="sub" style={{ marginBottom: 0 }}>
            Accountability from FinTrack Steward — especially when you spend
            past the plan.
          </p>
        </div>
        {messages.some((m) => !m.read) && (
          <button type="button" className="btn btn-secondary" style={{ width: "auto", padding: "8px 14px" }} onClick={markAll}>
            Mark all read
          </button>
        )}
      </div>

      {messages.length === 0 ? (
        <div className="card empty">
          No messages yet. When you confirm an overspend, Steward writes you
          here.
        </div>
      ) : (
        messages.map((m) => (
          <div
            key={m.id}
            className="card"
            style={{
              borderColor: m.read ? "var(--bd)" : "var(--g)",
              opacity: m.read ? 0.85 : 1,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                marginBottom: 8,
              }}
            >
              <h2 style={{ fontSize: 14 }}>
                {!m.read && (
                  <span className="pill pill-g" style={{ marginRight: 8 }}>
                    new
                  </span>
                )}
                {m.title}
              </h2>
              <span className="muted" style={{ whiteSpace: "nowrap" }}>
                {formatTxDate(m.createdAt)}
              </span>
            </div>
            <p style={{ whiteSpace: "pre-wrap", fontSize: 13, color: "var(--tx2)", lineHeight: 1.6 }}>
              {m.body}
            </p>
            {!m.read && (
              <button
                type="button"
                className="btn btn-ghost"
                style={{ marginTop: 10 }}
                onClick={() => markRead(m.id)}
              >
                Mark read
              </button>
            )}
          </div>
        ))
      )}
    </AppShell>
  );
}
