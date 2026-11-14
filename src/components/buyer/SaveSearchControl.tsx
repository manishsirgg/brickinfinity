"use client";
import Link from "next/link";
import { useState } from "react";
export default function SaveSearchControl({ filters, emailConfigured }: { filters: Record<string, string | undefined>; emailConfigured: boolean }) {
  const [open, setOpen] = useState(false), [name, setName] = useState(""), [email, setEmail] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [success, setSuccess] = useState(false);
  const returnPath = `/properties?${new URLSearchParams(Object.entries(filters).filter((entry): entry is [string, string] => typeof entry[1] === "string"))}`;
  return <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
    <button type="button" onClick={() => setOpen(!open)} className="font-semibold underline">Save this search & get matching alerts</button>
    {open && <form className="space-y-3" onSubmit={async event => {
      event.preventDefault(); setBusy(true); setError(""); setSuccess(false);
      try {
        const response = await fetch("/api/saved-searches", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save", filters, name, email }) });
        const payload = await response.json(); if (!response.ok) throw Error(payload.error);
        setSuccess(true);
      } catch (err) { setError(err instanceof Error ? err.message : "Search could not be saved."); } finally { setBusy(false); }
    }}>
      <p className="text-sm text-muted">Saves the filters applied to these results. New matching listings are checked daily. Existing listings won’t trigger an initial alert.</p>
      <label className="block text-sm">Search name (optional)<input value={name} onChange={e => setName(e.target.value)} maxLength={200} className="block w-full rounded-lg border p-2" placeholder="Commercial rent in Chhatarpur" /></label>
      <p className="text-sm">In-app matching alerts included.</p>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={email} disabled={!emailConfigured} onChange={e => setEmail(e.target.checked)} />Also email me matching listings at my verified account email. I can turn this off at any time.</label>
      {!emailConfigured && <p className="text-xs text-muted">Email alerts will be available after email delivery is configured. In-app alerts work without email.</p>}
      <button disabled={busy} className="btn-primary" type="submit">{busy ? "Saving…" : "Save applied search"}</button>
      {error && <p role="alert" className="text-sm text-red-700">{error} <Link href={`/login?redirect=${encodeURIComponent(returnPath)}`} className="underline">Sign in</Link></p>}
      {success && <p role="status" className="text-sm text-green-800">Search saved. <Link href="/buyer?tab=searches" className="underline">Manage searches, preferences and matches</Link>. If already saved, your existing preferences are kept.</p>}
    </form>}
  </div>;
}
