"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/toast";

/** The name FinTrack greets you with. Leave it empty to be greeted from your email. */
export function ProfileName({ initial }: { initial: string }) {
  const router = useRouter();
  const [name, setName] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/settings/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Could not save your name.");
      toast("Name saved");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your name.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="mt-3 flex flex-wrap items-end gap-2">
      <div className="min-w-48 flex-1">
        <label className="mlbl block" htmlFor="profile-name">
          Your name
        </label>
        <input
          id="profile-name"
          className="minp"
          value={name}
          maxLength={60}
          autoComplete="given-name"
          placeholder="What should we call you?"
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <button type="submit" className="btn btn-ghost !mt-0 !w-auto px-4 py-2.5" disabled={busy || name.trim() === initial.trim()}>
        {busy ? "Saving…" : "Save name"}
      </button>
      {error && (
        <div className="error w-full" role="alert">
          {error}
        </div>
      )}
    </form>
  );
}
