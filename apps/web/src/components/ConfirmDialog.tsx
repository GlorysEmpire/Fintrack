"use client";

/**
 * A confirmation dialog for actions that deserve a deliberate yes
 * (deleting a transaction, changing the plan, resetting FinTrack).
 *
 * Built on Radix Dialog, so focus is trapped inside it, Escape closes it and
 * screen readers announce it as a dialog.
 */
import type { ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  children,
  confirmLabel,
  busyLabel = "Working…",
  cancelLabel = "Cancel",
  danger = false,
  busy = false,
  confirmDisabled = false,
  error,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  busyLabel?: string;
  cancelLabel?: string;
  /** Style the confirm button as destructive */
  danger?: boolean;
  busy?: boolean;
  confirmDisabled?: boolean;
  error?: string | null;
  onConfirm: () => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <Dialog.Portal>
        <Dialog.Overlay className="cdlg-overlay" />
        <Dialog.Content className="cdlg modal glass-card" aria-describedby={undefined}>
          <Dialog.Title asChild>
            <h2>{title}</h2>
          </Dialog.Title>
          <div className="cdlg-body">{children}</div>
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          <button
            type="button"
            className={`btn ${danger ? "btn-danger" : "btn-primary"}`}
            disabled={busy || confirmDisabled}
            onClick={onConfirm}
            style={{ marginTop: 16 }}
          >
            {busy ? busyLabel : confirmLabel}
          </button>
          <Dialog.Close asChild>
            <button type="button" className="btn btn-ghost" disabled={busy}>
              {cancelLabel}
            </button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
