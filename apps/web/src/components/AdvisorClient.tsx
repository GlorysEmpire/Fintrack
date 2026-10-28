"use client";

/**
 * The Advisor: Steward's notes from your own numbers, quick questions, and the chat.
 * Talks to POST /api/ai/chat; with no online AI connected it answers from fixed rules
 * over the same numbers, and says so.
 */
import { useEffect, useRef, useState } from "react";
import { Send, Sparkles, Trash2 } from "lucide-react";
import { AppShell } from "./AppShell";
import { ConfirmDialog } from "./ConfirmDialog";
import { EmptyState } from "./EmptyState";
import { PageHeader } from "./PageHeader";
import { InfoTip } from "@/components/ui/info-tip";
import { InsightCards, type Note } from "./advisor/InsightCards";
import { MessageBubble, TypingDots } from "./advisor/Bubbles";

const CHIPS = [
  "Am I on track this month?",
  "How is my tithe looking?",
  "How much should I set aside for investments?",
  "Give me a full monthly summary",
  "Where can I improve my finances?",
];

const GREETING =
  "Hi, I'm FinTrack Steward. I know your plan, buckets and logged numbers. I coach from timeless principles (pay your future first, keep a margin, truth over vibes), not generic internet tips. Ask anything about your money.";

type Msg = { id?: string; role: string; content: string };

export function AdvisorClient({
  baseCurrency,
  email,
  inboxUnread,
  liveAi,
  initialMessages,
  notes,
}: {
  baseCurrency: string;
  email: string;
  inboxUnread: number;
  liveAi: boolean;
  initialMessages: Msg[];
  notes: Note[];
}) {
  const [messages, setMessages] = useState<Msg[]>(initialMessages.length ? initialMessages : [{ role: "assistant", content: GREETING }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    end.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "end" });
  }, [messages, loading]);

  async function clearChat() {
    setError(null);
    try {
      const res = await fetch("/api/ai/chat", { method: "DELETE" });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Failed");
      setMessages([]);
      setConfirmDelete(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
      setConfirmDelete(false);
    }
  }

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
      setMessages((m) => [...m, { role: "assistant", content: data.reply }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell baseCurrency={baseCurrency} email={email} inboxUnread={inboxUnread}>
      <PageHeader
        title="Advisor"
        infoLabel="About the Advisor"
        info="A coach bound to your own plan and figures, not a generic web AI. When you ask a question, a summary of your plan and figures is sent to our AI provider (xAI) to write the answer. Your name and email are not included, and Steward cannot change your data."
      >
        <span
          className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${liveAi ? "bg-primary/12 text-primary" : "bg-warning/15 text-warning"}`}
        >
          {liveAi ? "Online Steward" : "Guided coach"}
          {!liveAi && (
            <InfoTip label="About the guided coach" align="end">
              The online Steward isn&apos;t connected yet. The guided coach answers from fixed rules over your own numbers, so
              everything you see is worked out by code from what you recorded.
            </InfoTip>
          )}
        </span>
      </PageHeader>

      <InsightCards notes={notes} startOpen={messages.length <= 1} />

      <div className="-mx-1 mb-3 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label="Quick questions">
        {CHIPS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => send(c)}
            disabled={loading}
            className="shrink-0 rounded-full border border-border bg-muted px-3.5 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-ring"
          >
            {c}
          </button>
        ))}
      </div>

      <div className="flex h-[min(34rem,calc(100dvh-20rem))] min-h-72 flex-col rounded-2xl border border-border bg-[var(--surface-glass)]">
        <div className="flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
          {messages.length === 0 ? (
            <EmptyState
              icon={Sparkles}
              title="No messages yet"
              description="Ask Steward about your plan, tithe, or this month's numbers."
              actionLabel="Am I on track?"
              onAction={() => send(CHIPS[0])}
            />
          ) : (
            messages.map((m, i) => <MessageBubble key={m.id || i} role={m.role} content={m.content} />)
          )}
          {loading && <TypingDots />}
          <div ref={end} />
        </div>
        <form
          className="flex items-end gap-2 border-t border-border p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={1}
            maxLength={2000}
            aria-label="Message to Steward"
            placeholder="Ask anything about your finances…"
            className="max-h-32 min-h-11 flex-1 resize-none rounded-xl border border-border bg-muted px-3.5 py-2.5 text-sm outline-none focus:border-primary"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
            }}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            aria-label="Send"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <Send className="h-[18px] w-[18px]" aria-hidden />
          </button>
        </form>
      </div>

      <div className="mt-3 flex items-center justify-end">
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          disabled={loading}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" aria-hidden /> Delete this conversation
        </button>
      </div>
      {error && <div className="error mt-2">{error}</div>}

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this conversation?"
        confirmLabel="Delete conversation"
        danger
        onConfirm={() => void clearChat()}
      >
        This deletes your whole conversation with Steward. It can not be undone.
      </ConfirmDialog>
    </AppShell>
  );
}
