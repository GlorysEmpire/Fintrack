"use client";

/**
 * Owns the log sheet for the whole app shell, so the + button works from
 * every page. Its data is fetched fresh each time it opens, so balances and
 * rules are never stale.
 */
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { toast } from "@/components/ui/toast";
import type { LogContext } from "@/lib/log-context";
import { LogTransactionModal } from "../LogTransactionModal";

type Api = {
  /** Fetch what the sheet needs, then open it */
  open: () => void;
  /** True while that fetch is running */
  busy: boolean;
};

const Ctx = createContext<Api | null>(null);

export function useLogSheet(): Api {
  const api = useContext(Ctx);
  if (!api) throw new Error("useLogSheet must be used inside the app shell");
  return api;
}

export function LogSheetProvider({ children }: { children: React.ReactNode }) {
  const [ctx, setCtx] = useState<LogContext | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const open = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/log-context", { cache: "no-store" });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Could not load");
      setCtx(data.context as LogContext);
      setIsOpen(true);
    } catch {
      toast("Could not open the log sheet. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }, []);

  const api = useMemo(() => ({ open, busy }), [open, busy]);

  return (
    <Ctx.Provider value={api}>
      {children}
      {ctx && (
        <LogTransactionModal
          open={isOpen}
          onClose={() => setIsOpen(false)}
          plan={ctx.plan}
          sources={ctx.sources}
          accounts={ctx.accounts}
          baseCurrency={ctx.baseCurrency}
          fx={ctx.fx}
          bucketRemaining={ctx.bucketRemaining}
          monthIncome={ctx.monthIncome}
        />
      )}
    </Ctx.Provider>
  );
}
