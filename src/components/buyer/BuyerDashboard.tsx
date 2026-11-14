"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import PropertyCard from "@/components/property/PropertyCard";
import { savedSearchHref } from "@/lib/buyer/links";
import type { BuyerProperty, SavedSearch } from "@/lib/buyer/types";
type Activity = { property_id: string; title: string; happened_at: string | null; visit_status: string | null; property: BuyerProperty | null };
type Match = { id: string; search_id: string; name: string; matched_at: string; email_state: string; property: BuyerProperty | null };
const tabs = { saved: "Saved", viewed: "Recently viewed", contacted: "Contacted", visits: "Visit requested", searches: "Saved searches & alerts" };
const date = (raw: string) => new Date(raw).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });
const mailStatus: Record<string, string> = { none: "In-app only", pending: "Email queued · verified email required", sending: "Email processing", accepted: "Accepted by email provider", failed: "Email delivery unconfirmed · use this in-app match", cancelled: "Email cancelled" };
export default function BuyerDashboard({ tab }: { tab: keyof typeof tabs }) {
  const [items, setItems] = useState<Activity[]>([]), [searches, setSearches] = useState<SavedSearch[]>([]), [matches, setMatches] = useState<Match[]>([]);
  const [page, setPage] = useState(0), [total, setTotal] = useState(0), [emailConfigured, setEmailConfigured] = useState(false);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(""), [success, setSuccess] = useState("");
  const notice = useRef<HTMLDivElement>(null);
  useEffect(() => { if (error || success) { notice.current?.scrollIntoView({ behavior: "smooth", block: "start" }); notice.current?.focus({ preventScroll: true }); } }, [error, success]);
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch(tab === "searches" ? "/api/saved-searches" : `/api/buyer?category=${tab}&offset=${page * 12}`, { cache: "no-store" });
      const data = await response.json(); if (!response.ok) throw Error(data.error);
      if (tab === "searches") { setSearches(data.searches); setMatches(data.matches); setEmailConfigured(data.emailConfigured); }
      else { setItems(data.items); setTotal(data.total); }
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to load your dashboard."); } finally { setLoading(false); }
  }, [tab, page]);
  useEffect(() => { void load(); }, [load]);
  async function action(url: string, body: object, message: string) {
    if (busy) return;
    setBusy(true); setError(""); setSuccess("");
    try { const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const payload = await response.json(); if (!response.ok) throw Error(payload.error); setSuccess(message); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "Unable to save changes."); } finally { setBusy(false); }
  }
  return <main className="container-custom py-12 space-y-6"><header className="space-y-3"><h1 className="text-3xl font-bold">My property dashboard</h1><p className="text-muted">Your saved properties, private viewing history, enquiries, visits and matching alerts.</p><div className="flex flex-wrap gap-4"><Link href="/properties" className="underline">Find properties</Link><Link href="/enquiries" className="underline">Manage enquiries & visits</Link><Link href="/compare" className="underline">Compare properties</Link></div></header>
    <nav aria-label="Buyer activity" className="flex flex-wrap gap-2">{Object.entries(tabs).map(([key, name]) => <Link key={key} aria-current={tab === key ? "page" : undefined} className={`rounded-full border px-4 py-2 text-sm ${tab === key ? "bg-slate-900 text-white" : "bg-white"}`} href={`/buyer?tab=${key}`}>{name}</Link>)}</nav>
    <div ref={notice} tabIndex={-1} className="scroll-mt-28" aria-live="polite">{error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-700">{error}</p>}{success && <p className="rounded-xl bg-green-50 p-4 text-green-800">{success}</p>}</div>
    <div className="flex flex-wrap gap-4"><button className="underline" disabled={loading || busy} onClick={() => void load()}>Refresh</button>{tab === "viewed" && <button disabled={busy || loading} className="underline" onClick={() => { if (confirm("Clear your recently viewed property history?")) void action("/api/buyer", { action: "clear_views" }, "Viewing history cleared."); }}>Clear viewing history</button>}</div>
    {tab === "viewed" && <p className="text-sm text-muted">Up to 100 recently viewed properties from the last 90 days. Recorded only while signed in; visible only to you. Clearing history does not change a listing’s public view count.</p>}
    {tab === "contacted" && <p className="text-sm text-muted">Properties you enquired about or revealed contact details for through the tracked form. This does not imply the seller has replied.</p>}
    {loading ? <p>Loading…</p> : tab === "searches" ? <>
      <p className="text-sm text-muted">New matches are checked daily. Pause or delete a search to stop future alerts. Email is optional; WhatsApp alerts are not enabled. Current listings do not trigger an initial alert.</p>
      {!emailConfigured && <p className="rounded-xl bg-amber-50 p-4 text-sm">Email delivery is not configured yet. In-app matching alerts remain available.</p>}
      {!searches.length && <p className="rounded-xl border p-6">No saved searches. Apply filters on <Link className="underline" href="/properties">Find properties</Link>, then choose “Save this search”.</p>}
      <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">{searches.map(search => <section className="rounded-xl border bg-white p-5 space-y-3" key={search.id}><h2 className="text-lg font-semibold">{search.name}</h2><p className="text-sm">{search.enabled ? "Active · in-app alerts on" : "Paused"} · {search.email_enabled ? "Email opted in" : "Email off"}</p><Link href={savedSearchHref(search.query)} className="inline-block underline">Run this search</Link><div className="flex flex-wrap gap-3 text-sm"><button disabled={busy} className="rounded-lg border px-3 py-2" onClick={() => void action("/api/saved-searches", { id: search.id, action: search.enabled ? "pause" : "resume" }, search.enabled ? "Search paused. Queued unsent emails stopped." : "Search resumed for future matching listings.")}>{search.enabled ? "Pause alerts" : "Resume alerts"}</button><button disabled={busy || (!search.email_enabled && !emailConfigured)} className="rounded-lg border px-3 py-2 disabled:opacity-50" onClick={() => void action("/api/saved-searches", { id: search.id, action: search.email_enabled ? "email_off" : "email_on" }, search.email_enabled ? "Email alerts turned off." : "Email consent saved for future matches.")}>{search.email_enabled ? "Turn off email" : "Opt into email alerts"}</button><button disabled={busy} className="rounded-lg border px-3 py-2 text-red-700" onClick={() => { if (confirm("Delete this saved search and stop future alerts?")) void action("/api/saved-searches", { id: search.id, action: "delete" }, "Saved search deleted."); }}>Delete search</button></div></section>)}</div>
      <h2 className="text-xl font-semibold">Recent matching alerts</h2><p className="text-xs text-muted">The latest 30 matches. Email acceptance by the provider is not proof of inbox delivery. Manage each search above to opt out.</p>
      {!matches.length && <p>No new matching listings yet.</p>}
      <div className="grid min-w-0 grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">{matches.map(match => <section key={match.id} className="min-w-0 space-y-3"><p className="text-sm font-medium">{match.name}</p><p className="text-xs text-muted">{date(match.matched_at)} IST · {mailStatus[match.email_state] || match.email_state}</p>{match.property ? <PropertyCard property={match.property} /> : <p className="rounded-xl border p-6">This matching listing is no longer publicly available.</p>}</section>)}</div>
    </> : <>
      <p>{total} properties</p>{!items.length && <p className="rounded-xl border p-6">No properties in this category yet.</p>}
      <div className="grid min-w-0 grid-cols-1 items-start gap-5 sm:grid-cols-2 lg:grid-cols-3">{items.map(item => <section key={item.property_id} className="min-w-0 space-y-3">{item.happened_at && <p className="text-xs text-muted">{date(item.happened_at)} IST{item.visit_status ? ` · Visit ${item.visit_status}` : ""}</p>}{item.property ? <PropertyCard property={item.property} /> : <div className="rounded-xl border p-6"><p>{item.title}</p><p className="text-sm text-muted">This property is no longer publicly available.</p></div>}{tab === "saved" && <button disabled={busy} className="text-sm underline" onClick={() => void action("/api/favorites", { propertyId: item.property_id, action: "remove" }, "Property removed from your saved list.")}>Remove saved property</button>}{["contacted", "visits"].includes(tab) && <Link href="/enquiries" className="text-sm underline">View enquiry & visit history</Link>}</section>)}</div>
      <div className="flex items-center gap-4"><button disabled={page === 0 || busy} className="rounded-lg border px-4 py-2 disabled:opacity-50" onClick={() => setPage(page - 1)}>Previous</button><span>Page {page + 1}</span><button disabled={(page + 1) * 12 >= total || busy} className="rounded-lg border px-4 py-2 disabled:opacity-50" onClick={() => setPage(page + 1)}>Next</button></div>
    </>}
  </main>;
}
