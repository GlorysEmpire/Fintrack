import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

/** One chat message: yours on the right in the brand colour, Steward's on the left with a spark. */
export function MessageBubble({ role, content }: { role: string; content: string }) {
  const mine = role === "user";
  return (
    <div className={cn("flex items-end gap-2", mine ? "justify-end" : "justify-start")}>
      {!mine && (
        <span className="mb-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary" aria-hidden>
          <Sparkles className="h-4 w-4" />
        </span>
      )}
      <div
        className={cn(
          "max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed md:max-w-[75%]",
          mine
            ? "rounded-br-md bg-primary font-medium text-primary-foreground"
            : "rounded-bl-md border border-border bg-[var(--surface-glass)] backdrop-blur"
        )}
      >
        {content}
      </div>
    </div>
  );
}

/** Three dots that pulse while Steward is answering (a still "…" under reduced motion) */
export function TypingDots() {
  return (
    <div className="flex items-end gap-2" role="status" aria-label="Steward is typing">
      <span className="mb-1 flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-primary" aria-hidden>
        <Sparkles className="h-4 w-4" />
      </span>
      <div className="flex gap-1 rounded-2xl rounded-bl-md border border-border bg-[var(--surface-glass)] px-4 py-3.5">
        {[0, 1, 2].map((i) => (
          <span key={i} className="typing-dot h-2 w-2 rounded-full bg-muted-foreground" style={{ animationDelay: `${i * 150}ms` }} />
        ))}
      </div>
    </div>
  );
}
