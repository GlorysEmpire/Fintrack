"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowDownLeft, ArrowUpRight, Search, Sparkles, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLogSheet } from "./log/LogSheetProvider";
import { MAIN_NAV, MANAGE_NAV } from "./shell/nav-items";

type Command = { id: string; label: string; hint: string; icon: LucideIcon; keywords: string; run: () => void };

/**
 * Jump anywhere or start a task from the keyboard: type to filter, arrows to move,
 * Enter to run, Escape to close. Opened with Ctrl or ⌘ + K, or "/" outside a field.
 */
export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const { open: openLog } = useLogSheet();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const list = useRef<HTMLUListElement>(null);

  const commands = useMemo<Command[]>(() => {
    const go = (href: string) => () => router.push(href);
    return [
      { id: "log-expense", label: "Log an expense", hint: "Action", icon: ArrowUpRight, keywords: "spend add new transaction", run: () => openLog({ type: "e" }) },
      { id: "log-income", label: "Log income", hint: "Action", icon: ArrowDownLeft, keywords: "salary paid add new transaction", run: () => openLog({ type: "i" }) },
      { id: "ask", label: "Ask the Advisor", hint: "Action", icon: Sparkles, keywords: "steward chat question help", run: go("/advisor") },
      ...[...MAIN_NAV, ...MANAGE_NAV].map((n) => ({
        id: n.href,
        label: n.label,
        hint: "Go to",
        icon: n.icon,
        keywords: n.href.slice(1),
        run: go(n.href),
      })),
      { id: "imports", label: "Bank imports", hint: "Go to", icon: Search, keywords: "bank import csv statement", run: go("/imports") },
    ];
  }, [router, openLog]);

  const shown = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return commands;
    return commands.filter((c) => words.every((w) => `${c.label} ${c.keywords}`.toLowerCase().includes(w)));
  }, [commands, query]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
    }
  }, [open]);
  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    list.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function run(c: Command | undefined) {
    if (!c) return;
    onOpenChange(false);
    // Let the palette close first so the next screen or sheet gets focus
    setTimeout(c.run, 0);
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[210] bg-black/60 backdrop-blur-sm" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-[12vh] z-[220] w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-2xl border border-border bg-[var(--surface-elevated)] shadow-[var(--shadow-glass)] outline-none"
        >
          <Dialog.Title className="sr-only">Search and commands</Dialog.Title>
          <div className="flex items-center gap-2 border-b border-border px-4">
            <Search className="h-4 w-4 text-muted-foreground" aria-hidden />
            <input
              autoFocus
              role="combobox"
              aria-expanded
              aria-controls="palette-list"
              aria-activedescendant={shown[active] ? `palette-${shown[active].id}` : undefined}
              aria-label="Search pages and actions"
              placeholder="Search pages and actions…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActive((a) => Math.min(shown.length - 1, a + 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActive((a) => Math.max(0, a - 1));
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  run(shown[active]);
                }
              }}
              className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <ul id="palette-list" ref={list} role="listbox" aria-label="Results" className="max-h-80 overflow-y-auto p-1.5">
            {shown.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted-foreground">Nothing matches &ldquo;{query}&rdquo;.</li>}
            {shown.map((c, i) => {
              const Icon = c.icon;
              return (
                <li
                  key={c.id}
                  id={`palette-${c.id}`}
                  role="option"
                  aria-selected={i === active}
                  onMouseMove={() => setActive(i)}
                  onClick={() => run(c)}
                  className={cn("flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm", i === active && "bg-primary/10 text-primary")}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden />
                  <span className="flex-1">{c.label}</span>
                  <span className="text-xs text-muted-foreground">{c.hint}</span>
                </li>
              );
            })}
          </ul>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
