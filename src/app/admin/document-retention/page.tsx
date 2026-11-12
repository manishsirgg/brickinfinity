"use client";
import { useCallback, useEffect, useRef, useState } from "react";
type FileRow = { bucket_id: string; path: string; current?: boolean; history?: boolean; hold?: boolean; state?: string; reason?: string; size_bytes?: number | null; released_at?: string | null; deleted_at?: string | null; sha256?: string | null; last_error?: string | null; attempts?: number };
type Payload = { policy: { enabled: boolean; reviewed_days: number | null }; candidates: FileRow[]; inventory: FileRow[]; files: FileRow[]; events: { id: string; action: string; path: string | null; actor_auth_id: string | null; created_at: string; details: Record<string, unknown> }[]; cronConfigured: boolean };
export default function DocumentRetentionPage() {
  const [data, setData] = useState<Payload | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  const [offset, setOffset] = useState(0), [enabled, setEnabled] = useState(true), [days, setDays] = useState("");
  const [bucket, setBucket] = useState("identity-documents"), [path, setPath] = useState(""), [action, setAction] = useState("hold"), [reason, setReason] = useState(""), [closed, setClosed] = useState(false);
  const revision = useRef(0);
  const load = useCallback(async () => {
    const version = ++revision.current;
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/document-retention?offset=${offset}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not load retention data.");
      if (version === revision.current) { setData(payload); setEnabled(payload.policy.enabled); setDays(payload.policy.reviewed_days?.toString() || ""); }
    } catch (error) { if (version === revision.current) setError(error instanceof Error ? error.message : "Could not load retention data."); }
    finally { if (version === revision.current) setBusy(false); }
  }, [offset]);
  useEffect(() => { void load(); }, [load]);
  async function change(body: Record<string, unknown>) {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/admin/document-retention", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Action failed.");
      setMessage(body.action === "run" ? `Cleanup finished: ${result.deleted} deleted, ${result.failures.length} reported errors, ${result.deferred} deferred. Failed or interrupted claims remain retryable.` : "Retention setting saved and audited.");
      await load();
    } catch (error) { setError(error instanceof Error ? error.message : "Action failed."); }
    finally { setBusy(false); }
  }
  return <main className="mx-auto max-w-7xl space-y-6 p-4 sm:p-8">
    <h1 className="text-2xl font-semibold">Document retention</h1>
    <p className="text-sm text-slate-600">Current and pending evidence stays protected. Cleanup removes eligible file bytes and retains review records and deletion history. Preview lists up to 50 candidates; each run claims up to 20 files.</p>
    {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">{error}</p>}
    {message && <p role="status" className="rounded-xl border border-green-200 bg-green-50 p-4 text-green-800">{message}</p>}
    {busy && <p role="status">Loading or processing…</p>}
    <button type="button" disabled={busy} onClick={() => { setError(""); void load(); }} className="rounded-lg border px-4 py-2 disabled:opacity-50">Refresh preview</button>
    {data && <>
      {!data.cronConfigured && <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">Daily cleanup is not configured: add CRON_SECRET to the Vercel environment and redeploy. Manual cleanup is available here.</p>}
      <section className="space-y-4 rounded-xl border p-5">
        <h2 className="text-lg font-semibold">Retention policy</h2>
        <p className="text-sm">Unreferenced uploads: 48 hours. Known superseded unreviewed files: 7 days. Older referenced files with uncertain history require an explicit historical release.</p>
        <label className="flex items-center gap-2"><input type="checkbox" checked={enabled} disabled={busy} onChange={event => setEnabled(event.target.checked)} />Allow cleanup claims</label>
        <label className="block text-sm">Reviewed-history days after an admin records case closure and releases that file (blank = disabled)
          <input type="number" min={30} max={3650} value={days} disabled={busy} onChange={event => setDays(event.target.value)} className="mt-2 block w-full max-w-xs rounded-lg border p-2" />
        </label>
        <p className="text-xs text-slate-600">Enabling a period does not release files automatically. Holds and current-review protections always take priority. Pausing stops new claims; an in-flight deletion may still finish.</p>
        <button disabled={busy} onClick={() => {
          const reviewedDays = days.trim() ? Number(days) : null;
          if (reviewedDays !== null && (!Number.isInteger(reviewedDays) || reviewedDays < 30 || reviewedDays > 3650)) { setError("Choose 30–3650 days or leave reviewed-history cleanup disabled."); return; }
          void change({ action: "policy", enabled, reviewedDays });
        }} className="rounded-lg border px-4 py-2 disabled:opacity-50">Save policy</button>
      </section>
      <section className="space-y-3 rounded-xl border p-5">
        <h2 className="text-lg font-semibold">Eligible cleanup preview ({data.candidates.length})</h2>
        {!data.candidates.length && <p className="text-sm">No eligible files in this preview.</p>}
        <ul className="space-y-2 text-sm">{data.candidates.map(file => <li key={`${file.bucket_id}/${file.path}`} className="break-all rounded-lg bg-slate-50 p-3">{file.bucket_id}/{file.path}<br />{file.reason} · {file.size_bytes == null ? "Size unavailable" : `${(file.size_bytes / 1048576).toFixed(2)} MB`}</li>)}</ul>
        <button disabled={busy || !data.policy.enabled} onClick={() => void change({ action: "run" })} className="rounded-lg bg-slate-900 px-4 py-2 text-white disabled:opacity-50">Run eligible cleanup / retry interrupted claims</button>
      </section>
      <section className="space-y-3 rounded-xl border p-5">
        <h2 className="text-lg font-semibold">Stored evidence files</h2>
        <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">File</th><th className="p-2">Protection</th><th className="p-2">Manage</th></tr></thead><tbody>{data.inventory.map(file => <tr key={`${file.bucket_id}/${file.path}`} className="border-t"><td className="max-w-lg break-all p-2">{file.bucket_id}/{file.path}</td><td className="p-2">{file.current ? "In use / open case" : file.history ? "Reviewed/legacy history" : "Unreviewed"}{file.hold && " · On hold"}{file.released_at && " · Expiry scheduled"}{file.state === "deleting" && " · Cleanup in progress"}</td><td className="p-2"><button disabled={busy || file.state === "deleting"} className="rounded border px-3 py-2 disabled:opacity-50" onClick={() => { setBucket(file.bucket_id); setPath(file.path); setClosed(false); }}>Select file</button></td></tr>)}</tbody></table></div>
        <div className="flex gap-3"><button disabled={busy || !offset} onClick={() => setOffset(previous => Math.max(0, previous - 100))} className="rounded border px-3 py-2 disabled:opacity-50">Previous</button><button disabled={busy || data.inventory.length < 100} onClick={() => setOffset(previous => previous + 100)} className="rounded border px-3 py-2 disabled:opacity-50">Next</button></div>
      </section>
      <section className="space-y-3 rounded-xl border p-5">
        <h2 className="text-lg font-semibold">Hold or release an individual file</h2>
        <label className="block text-sm">Bucket<select value={bucket} disabled={busy} onChange={event => setBucket(event.target.value)} className="mt-1 block w-full rounded border p-2">{["identity-documents", "ownership-documents", "declaration-documents"].map(value => <option key={value}>{value}</option>)}</select></label>
        <label className="block text-sm">Relative file path<input value={path} disabled={busy} onChange={event => setPath(event.target.value)} className="mt-1 block w-full rounded border p-2" /></label>
        <label className="block text-sm">Action<select value={action} disabled={busy} onChange={event => { setAction(event.target.value); setClosed(false); }} className="mt-1 block w-full rounded border p-2"><option value="hold">Place hold</option><option value="unhold">Remove hold</option><option value="release">Schedule reviewed-history expiry after case closure</option><option value="cancel_release">Cancel scheduled expiry</option><option value="retry">Retry failed cleanup after investigation</option></select></label>
        <label className="block text-sm">Reason<textarea maxLength={2000} value={reason} disabled={busy} onChange={event => setReason(event.target.value)} className="mt-1 block w-full rounded border p-2" /></label>
        {action === "release" && <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={closed} onChange={event => setClosed(event.target.checked)} />I confirm this case is closed and the historical file is no longer needed for ongoing review or a dispute. Current and pending evidence cannot be released.</label>}
        <button disabled={busy || !path || !reason.trim() || (action === "release" && !closed)} onClick={() => void change({ action, bucket, path, reason, confirmClosed: closed })} className="rounded-lg border px-4 py-2 disabled:opacity-50">Apply file action</button>
      </section>
      <section className="space-y-3 rounded-xl border p-5"><h2 className="text-lg font-semibold">Deletion records and active claims</h2><ul className="space-y-3 text-sm">{data.files.map(file => <li className="break-all border-t pt-3" key={`${file.bucket_id}/${file.path}`}>{file.bucket_id}/{file.path}<br />{file.state}{file.deleted_at && ` · Deleted ${new Date(file.deleted_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`}{file.reason && ` · ${file.reason}`}{file.sha256 && <p>SHA-256: {file.sha256}</p>}{file.last_error && <><p className="text-red-700">{file.last_error} · Attempts: {file.attempts}{(file.attempts || 0) >= 5 && " · Automatic retries paused"}</p><button disabled={busy} onClick={() => { setBucket(file.bucket_id); setPath(file.path); setAction("retry"); setClosed(false); }} className="mt-2 rounded border px-3 py-2">Select failed cleanup for retry</button></>}</li>)}</ul></section>
      <section className="space-y-3 rounded-xl border p-5"><h2 className="text-lg font-semibold">Latest retention audit events</h2>{data.events.map(event => <div key={event.id} className="break-words border-t pt-3 text-sm"><p>{event.action} · {new Date(event.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} · {event.actor_auth_id || "System worker"}</p><p className="break-all">{event.path}</p><p>{JSON.stringify(event.details)}</p></div>)}</section>
    </>}
  </main>;
}
