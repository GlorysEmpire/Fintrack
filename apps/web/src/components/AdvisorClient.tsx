"use client";

/**
 * AI Advisor UI — chips + chat.
 * Talks to POST /api/ai/chat (server holds XAI_API_KEY).
 */
import { useState } from "react";
import { AppShell } from "./AppShell";

const CHIPS = [
  "Am I on track this month?",
  "How is my tithe looking?",
  "How much should I set aside for investments?",
  "Give me a full monthly summary",
  "Where can I improve my finances?",
];

type Msg = { id?: string; role: string; content: string };

export function AdvisorClient({
  baseCurrency,
  email,
  inboxUnread,
  liveAi,
  initialMessages,
}: {
  baseCurrency: string;
  email: string;
  inboxUnread: number;
  liveAi: boolean;
  initialMessages: Msg[];
}) {
  const [messages, setMessages] = useState<Msg[]>(
    initialMessages.length
      ? initialMessages
      : [
          {
            role: "assistant",
            content:
              "Hi — I'm FinTrack Steward. I know your plan, buckets, and logged numbers. I coach from timeless principles (pay future first, margin, truth over vibes) — not generic internet tips. Ask anything about your money.",
          },
        ]
  );
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(text: string) {
    const msg = text.trim();
    if (!msg || loading) return;
    setInput("");
    setError(null);
    setMessages((m) => [...m, { role: "user", content: msg }]);
    setLoading(true);
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Failed");
      setMessages((m) => [
        ...m,
        { role: "assistant", content: data.reply },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell
      baseCurrency={baseCurrency}
      email={email}
      inboxUnread={inboxUnread}
    >
      <div className="sec" style={{ marginTop: 0 }}>
        AI Finance Advisor
      </div>
      <p className="sub">
        Specialist coach bound to <strong>your</strong> plan — not a generic web
        AI.
        {liveAi ? (
          <span style={{ color: "var(--g)" }}> · Live AI connected</span>
        ) : (
          <span style={{ color: "var(--y)" }}>
            {" "}
            · Offline coach (set XAI_API_KEY for full Steward)
          </span>
        )}
      </p>

      <div style={{ marginBottom: 14 }}>
        {CHIPS.map((c) => (
          <button
            key={c}
            type="button"
            className="chip"
            onClick={() => send(c)}
            disabled={loading}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="ai-outer">
        <div className="ai-msgs">
          {messages.map((m, i) => (
            <div
              key={m.id || i}
              className={`msg ${m.role === "user" ? "u" : "a"}`}
            >
              {m.content}
            </div>
          ))}
          {loading && <div className="msg a">Thinking…</div>}
        </div>
        <div className="ai-in-row">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask anything about your finances…"
            onKeyDown={(e) => {
              if (e.key === "Enter") send(input);
            }}
          />
          <button type="button" onClick={() => send(input)} disabled={loading}>
            →
          </button>
        </div>
      </div>
      {error && <div className="error">{error}</div>}
    </AppShell>
  );
}
