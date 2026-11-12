"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

type Entry = {
  id: string; property_title: string; buyer_name: string; buyer_phone: string; buyer_email: string | null;
  message: string; status: string; delivered_at: string; read_at: string | null; contacted_at: string | null;
  visit_at: string | null; visit_status: string | null; crm_sync: string;
  events: { id: string; action: string; note: string | null; created_at: string; visit_at: string | null }[];
};
const date = (value: string) => new Date(value).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });
const label = (value: string) => ({ read: "Acknowledged by seller", contacted: "Seller marked contacted", closed: "Enquiry closed", requested: "Awaiting seller confirmation", confirmed: "Visit confirmed", declined: "Visit declined", cancelled: "Visit cancelled", completed: "Visit completed", reschedule: "New visit time requested", new: "Delivered to seller inbox" }[value] || value);

export default function EnquiryInbox({ seller }: { seller: boolean }) {
  const notice = useRef<HTMLDivElement>(null);
  const [items, setItems] = useState<Entry[]>([]);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [times, setTimes] = useState<Record<string, string>>({});
  useEffect(() => {
    if (error || success) { notice.current?.scrollIntoView({ behavior: "smooth", block: "start" }); notice.current?.focus({ preventScroll: true }); }
  }, [error, success]);
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/enquiries?view=${seller ? "seller" : "buyer"}&offset=${page * 20}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      setItems(payload.items); setTotal(payload.total);
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to load enquiries."); }
    finally { setLoading(false); }
  }, [seller, page]);
  useEffect(() => { void load(); }, [load]);
  async function action(item: Entry, value: string) {
    if (busy) return;
    setBusy(true); setError(""); setSuccess("");
    try {
      if (value === "reschedule" && !times[item.id]) throw new Error("Choose a new visit date and time first.");
      const response = await fetch("/api/enquiries", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        id: item.id, action: value, note: notes[item.id] || "",
        visit_at: value === "reschedule" ? new Date(`${times[item.id]}:00+05:30`).toISOString() : null,
      }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      setSuccess("Update saved and an in-app notification delivered.");
      setNotes(previous => ({ ...previous, [item.id]: "" }));
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to update enquiry."); }
    finally { setBusy(false); }
  }
  const button = (item: Entry, value: string, text: string) => <button type="button" disabled={busy} onClick={() => void action(item, value)} className="rounded-lg border px-4 py-2 disabled:opacity-50">{text}</button>;
  return <main className="container-custom py-12 space-y-6">
    <h1 className="text-3xl font-bold">{seller ? "Seller enquiries & visits" : "My enquiries & visits"}</h1>
    <p className="text-muted">Inbox delivery is recorded when your request is saved. Acknowledgement and contact statuses are recorded by the seller. All visit times are in IST. A visit is booked only after seller confirmation.</p>
    <nav className="flex gap-4 flex-wrap"><Link className="underline" href="/enquiries">My enquiries & visits</Link><Link className="underline" href="/enquiries?view=seller">Seller inbox</Link>{seller && <Link className="underline" href="/dashboard/leads">All leads & CRM</Link>}<button disabled={loading || busy} onClick={() => void load()} className="underline">Refresh</button></nav>
    <div ref={notice} tabIndex={-1} aria-live="polite" className="scroll-mt-28">{error && <p role="alert" className="rounded-lg bg-red-50 p-4 text-red-700">{error} <Link href="/login" className="underline">Sign in</Link></p>}{success && <p className="rounded-lg bg-green-50 p-4 text-green-800">{success}</p>}</div>
    {loading ? <p>Loading enquiries…</p> : <>
      <p>{total} enquiries</p>
      {!items.length && <p className="rounded-xl border p-8">No enquiries yet.</p>}
      {items.map(item => <article key={item.id} className="rounded-2xl border bg-surface p-5 md:p-8 space-y-4">
        <h2 className="text-xl font-semibold">{item.property_title}</h2>
        <p className="text-xs text-muted break-all">Reference: {item.id}</p>
        <p className="font-medium">{label(item.status)}</p>
        <p className="text-sm">Delivered: {date(item.delivered_at)}{item.read_at && ` · Acknowledged: ${date(item.read_at)}`}{item.contacted_at && ` · Marked contacted: ${date(item.contacted_at)}`}</p>
        {seller && <div><p>{item.buyer_name}</p><a className="underline" href={`tel:${item.buyer_phone}`}>{item.buyer_phone}</a>{item.buyer_email && <p><a className="underline" href={`mailto:${item.buyer_email}`}>{item.buyer_email}</a></p>}<p className="text-xs text-muted">CRM sync: {item.crm_sync}. This enquiry remains in your inbox even if CRM sync is delayed.</p></div>}
        {item.message && <p className="whitespace-pre-wrap break-words">{item.message}</p>}
        {item.visit_at && <div className="rounded-lg bg-blue-50 p-4"><p className="font-semibold">{label(item.visit_status!)} · {date(item.visit_at)} IST</p><p className="text-sm">Allow one hour. Coordinate the meeting point directly; never pay a viewing fee.</p></div>}
        <label className="block text-sm">Update note (shared with the other person; required to decline or cancel)
          <textarea maxLength={1000} value={notes[item.id] || ""} onChange={e => setNotes(previous => ({ ...previous, [item.id]: e.target.value }))} className="block w-full rounded-lg border p-3" rows={2} />
        </label>
        <div className="flex flex-wrap gap-3">
          {seller && item.status === "new" && button(item, "read", "Acknowledge enquiry")}
          {seller && ["new", "read"].includes(item.status) && button(item, "contacted", "Mark contacted")}
          {seller && item.status !== "closed" && !["requested", "confirmed"].includes(item.visit_status || "") && button(item, "closed", "Close enquiry")}
          {seller && item.visit_status === "requested" && <>{button(item, "confirmed", "Confirm visit")}{button(item, "declined", "Decline visit")}</>}
          {item.visit_status && ["requested", "confirmed"].includes(item.visit_status) && button(item, "cancelled", "Cancel visit")}
          {seller && item.visit_status === "confirmed" && new Date(item.visit_at!).getTime() <= Date.now() && button(item, "completed", "Mark visit completed")}
        </div>
        {!seller && item.status !== "closed" && item.visit_status && ["requested", "confirmed", "declined", "cancelled"].includes(item.visit_status) && <div className="flex flex-wrap gap-3 items-end"><label className="text-sm">Request another time (IST)<input type="datetime-local" value={times[item.id] || ""} onChange={e => setTimes(previous => ({ ...previous, [item.id]: e.target.value }))} className="block border rounded-lg p-3" /></label>{button(item, "reschedule", "Request new time")}<p className="text-xs text-muted">9 AM–6 PM IST; at least one hour ahead, within 60 days. A new time needs seller confirmation.</p></div>}
        <details><summary className="cursor-pointer">Tracking history</summary><ol className="mt-3 space-y-3">{item.events.map(event => <li key={event.id} className="border-l-2 pl-3"><p>{label(event.action)} · {date(event.created_at)}</p>{event.visit_at && <p className="text-sm">Visit: {date(event.visit_at)} IST</p>}{event.note && <p className="text-sm whitespace-pre-wrap break-words">{event.note}</p>}</li>)}</ol></details>
      </article>)}
      <div className="flex gap-4 items-center"><button disabled={page === 0 || busy} className="border rounded-lg px-4 py-2 disabled:opacity-50" onClick={() => setPage(page - 1)}>Previous</button><span>Page {page + 1}</span><button disabled={(page + 1) * 20 >= total || busy} className="border rounded-lg px-4 py-2 disabled:opacity-50" onClick={() => setPage(page + 1)}>Next</button></div>
    </>}
  </main>;
}
