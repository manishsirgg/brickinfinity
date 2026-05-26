"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { formatCurrency, formatDateTime, humanize } from "@/lib/seller-crm/format";
import { SellerCrmTimeline } from "./SellerCrmTimeline";
import { SellerCrmStageBadge, SellerCrmStatusBadge } from "./SellerCrmBadges";

type Mode = "overview" | "contacts" | "contact-detail" | "deals" | "deal-detail" | "followups" | "activities" | "settings";

function inr(value: any) {
  return formatCurrency(Number(value || 0));
}

function normalizeIndianWhatsApp(raw?: string | null) {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  return digits || null;
}

export function SellerCrmClientPage({ title, mode = "overview", id }: { title: string; subtitle?: string; mode?: Mode; id?: string }) {
  const [data, setData] = useState<any>(null);
  const [aux, setAux] = useState<any>({});
  const [tab, setTab] = useState("Overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState<Record<string, any>>({});

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const path =
        mode === "contact-detail"
          ? `/api/seller/crm/contacts/${id}`
          : mode === "deal-detail"
            ? `/api/seller/crm/deals/${id}`
            : mode === "activities"
              ? "/api/seller/crm/activities"
              : mode === "settings"
                ? "/api/seller/crm/settings"
                : mode === "contacts"
                  ? "/api/seller/crm/contacts"
                  : mode === "deals"
                    ? "/api/seller/crm/deals"
                    : mode === "followups"
                      ? "/api/seller/crm/followups"
                      : "/api/seller/crm/summary";
      const j = await (await fetch(path)).json();
      if (!j.ok) throw new Error(j.error || "Failed to load");
      setData(j.data);
      if (mode === "settings") setSettingsDraft(j.data?.settings ?? {});

      if (mode === "contact-detail") {
        const [n, f, d, a] = await Promise.all([
          fetch(`/api/seller/crm/notes?contact_id=${id}`),
          fetch(`/api/seller/crm/followups`),
          fetch(`/api/seller/crm/deals`),
          fetch(`/api/seller/crm/activities?contact_id=${id}`),
        ]);
        const [nj, fj, dj, aj] = await Promise.all([n.json(), f.json(), d.json(), a.json()]);
        setAux({
          notes: nj.data || [],
          followups: (fj.data || []).filter((x: any) => x.contact_id === id),
          deals: (dj.data || []).filter((x: any) => x.contact_id === id),
          timeline: aj.data || [],
        });
      }
      if (mode === "deal-detail") {
        const [n, f, a] = await Promise.all([
          fetch(`/api/seller/crm/notes?deal_id=${id}`),
          fetch(`/api/seller/crm/followups`),
          fetch(`/api/seller/crm/activities?deal_id=${id}`),
        ]);
        const [nj, fj, aj] = await Promise.all([n.json(), f.json(), a.json()]);
        setAux({ notes: nj.data || [], followups: (fj.data || []).filter((x: any) => x.deal_id === id), timeline: aj.data || [] });
      }
    } catch (e: any) {
      setError(e.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [mode, id]);

  const action = async (url: string, method: string, body: any, keepOpenOnFail = true) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error || "Save failed");
      await load();
      return true;
    } catch (e: any) {
      setError(e.message || "Save failed");
      return keepOpenOnFail ? false : true;
    } finally {
      setSaving(false);
    }
  };

  const tabs = mode === "contact-detail" ? ["Overview", "Follow-ups", "Deals", "Notes", "Timeline"] : mode === "deal-detail" ? ["Overview", "Follow-ups", "Notes", "Timeline"] : [];

  const followupBuckets = useMemo(() => {
    if (mode !== "followups") return {} as any;
    const now = Date.now();
    const arr = (data || []) as any[];
    return {
      overdue: arr.filter((x) => x.status === "scheduled" && new Date(x.due_at).getTime() < now),
      today: arr.filter((x) => x.status === "scheduled" && new Date(x.due_at).toDateString() === new Date().toDateString()),
      upcoming: arr.filter((x) => x.status === "scheduled" && new Date(x.due_at).getTime() > now && new Date(x.due_at).toDateString() !== new Date().toDateString()),
      completed: arr.filter((x) => x.status === "completed"),
      cancelled: arr.filter((x) => x.status === "cancelled"),
    };
  }, [data, mode]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-4">
      <h1 className="text-2xl font-bold">{title}</h1>
      {error ? <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
      {loading ? <div className="rounded-xl border bg-white p-4 text-sm text-gray-600">Loading…</div> : null}
      {!loading && mode === "contacts" && <div className="space-y-2">{(data || []).length ? (data || []).map((c: any) => <div key={c.id} className="border rounded p-3 text-sm flex items-center justify-between gap-2"><div><Link href={`/seller/crm/contacts/${c.id}`} className="font-semibold hover:underline">{c.full_name}</Link><div className="text-gray-600">{c.phone || c.email || "No phone/email"} • {humanize(c.lifecycle_stage)}</div></div><button className="border rounded px-2 py-1" disabled={saving} onClick={() => action(`/api/seller/crm/contacts/${c.id}`, "PATCH", { is_archived: !c.is_archived })}>{c.is_archived ? "Restore" : "Archive"}</button></div>) : <div className="rounded-xl border bg-white p-4 text-sm text-gray-600">No contacts yet.</div>}</div>}
      {!loading && mode === "deals" && <div className="space-y-2">{(data || []).length ? (data || []).map((d: any) => <div key={d.id} className="border rounded p-3 text-sm flex items-center justify-between gap-2"><div><Link href={`/seller/crm/deals/${d.id}`} className="font-semibold hover:underline">{d.title}</Link><div className="text-gray-600">{inr(d.expected_value)} • <SellerCrmStageBadge value={d.deal_stage} /></div></div></div>) : <div className="rounded-xl border bg-white p-4 text-sm text-gray-600">No deals yet.</div>}</div>}
      {!loading && mode === "followups" && <div className="grid gap-4 md:grid-cols-2">{Object.entries(followupBuckets).map(([k, items]) => <div key={k} className="border rounded p-3"><div className="font-semibold mb-2">{humanize(k)}</div><div className="space-y-2">{(items as any[]).length ? (items as any[]).map((f) => <div key={f.id} className="text-sm border rounded p-2">{f.title} • {formatDateTime(f.due_at)} • <SellerCrmStatusBadge value={f.status} /></div>) : <p className="text-sm text-gray-500">No {humanize(k).toLowerCase()} follow-ups.</p>}</div></div>)}</div>}

      {mode === "contact-detail" && !loading && <div className="flex gap-2 flex-wrap">{tabs.map((t: any) => <button key={t} onClick={() => setTab(t)} className="border rounded px-3 py-1">{t}</button>)}<button className="border rounded px-2" disabled={saving} onClick={() => action(`/api/seller/crm/contacts/${id}`, "PATCH", { lifecycle_stage: "converted" })}>Mark Converted</button><button className="border rounded px-2" disabled={saving} onClick={() => action(`/api/seller/crm/contacts/${id}`, "PATCH", { lifecycle_stage: "lost" })}>Mark Lost</button><button className="border rounded px-2" disabled={saving} onClick={() => action(`/api/seller/crm/contacts/${id}`, "PATCH", { is_archived: true })}>Archive</button><button className="border rounded px-2" disabled={saving} onClick={() => action(`/api/seller/crm/contacts/${id}`, "PATCH", { is_archived: false })}>Restore</button></div>}
      {mode === "deal-detail" && !loading && <div className="flex gap-2 flex-wrap">{tabs.map((t: any) => <button key={t} onClick={() => setTab(t)} className="border rounded px-3 py-1">{t}</button>)}<button className="border rounded px-2" disabled={saving} onClick={() => action(`/api/seller/crm/deals/${id}`, "PATCH", { deal_stage: "closed_won" })}>Mark Won</button><button className="border rounded px-2" disabled={saving} onClick={() => action(`/api/seller/crm/deals/${id}`, "PATCH", { deal_stage: "closed_lost" })}>Mark Lost</button></div>}
      {mode === "contact-detail" && tab === "Overview" && !loading && <div className="border rounded p-3 space-y-2"><div className="font-medium">{data?.full_name} • {humanize(data?.lifecycle_stage)}</div><div className="text-sm text-gray-700">Budget: {inr(data?.budget_min)} - {inr(data?.budget_max)}</div><div className="text-sm flex gap-2 flex-wrap">{data?.phone ? <a className="underline" href={`tel:${data.phone}`}>Call</a> : <span className="text-gray-400">Call unavailable</span>}{normalizeIndianWhatsApp(data?.whatsapp_number || data?.phone) ? <a className="underline" href={`https://wa.me/${normalizeIndianWhatsApp(data?.whatsapp_number || data?.phone)}`} target="_blank">WhatsApp</a> : <span className="text-gray-400">WhatsApp unavailable</span>}{data?.email ? <a className="underline" href={`mailto:${data.email}`}>Email</a> : <span className="text-gray-400">Email unavailable</span>}</div></div>}
      {mode === "deal-detail" && tab === "Overview" && !loading && <div className="border rounded p-3">{data?.title} • {humanize(data?.deal_stage)} • {inr(data?.expected_value)}</div>}
      {(["contact-detail", "deal-detail"] as any).includes(mode) && tab === "Notes" && !loading && <div className="space-y-2"><button disabled={saving} className="border rounded px-2" onClick={() => { const body = prompt("Note body"); if (body?.trim()) action("/api/seller/crm/notes", "POST", { body, contact_id: mode === "contact-detail" ? id : undefined, deal_id: mode === "deal-detail" ? id : undefined }); }}>Add Note</button>{(aux.notes || []).map((n: any) => <div key={n.id} className="border rounded p-2"><div>{n.title || "Note"}{n.is_pinned ? " 📌" : ""}{n.is_private ? " 🔒" : ""}</div><div className="text-sm">{n.body}</div><button onClick={() => { const body = prompt("Edit note", n.body); if (body?.trim()) action(`/api/seller/crm/notes/${n.id}`, "PATCH", { body }); }}>Edit</button><button onClick={() => action(`/api/seller/crm/notes/${n.id}`, "DELETE", {})}>Delete</button></div>)}</div>}
      {(["contact-detail", "deal-detail"] as any).includes(mode) && tab === "Follow-ups" && !loading && <div className="space-y-2"><button disabled={saving} className="border rounded px-2" onClick={() => action("/api/seller/crm/followups", "POST", { title: "New follow-up", due_at: new Date().toISOString(), contact_id: mode === "contact-detail" ? id : null, deal_id: mode === "deal-detail" ? id : null })}>Add Follow-up</button>{(aux.followups || []).map((f: any) => <div key={f.id} className="border rounded p-2">{f.title} - {f.status}<button onClick={() => action(`/api/seller/crm/followups/${f.id}`, "PATCH", { status: "completed" })}>Complete</button><button onClick={() => action(`/api/seller/crm/followups/${f.id}`, "PATCH", { status: "cancelled" })}>Cancel</button><button onClick={() => action(`/api/seller/crm/followups/${f.id}`, "PATCH", { status: "scheduled", due_at: new Date(Date.now() + 86400000).toISOString() })}>Reschedule</button></div>)}</div>}
      {mode === "contact-detail" && tab === "Deals" && !loading && <div><button disabled={saving} className="border rounded px-2" onClick={() => action("/api/seller/crm/deals", "POST", { title: "New deal", contact_id: id })}>Create Deal</button>{(aux.deals || []).map((d: any) => <div key={d.id}><Link href={`/seller/crm/deals/${d.id}`}>{d.title}</Link></div>)}</div>}
      {(["contact-detail", "deal-detail"] as any).includes(mode) && tab === "Timeline" && !loading && <SellerCrmTimeline items={aux.timeline || []} />}
      {mode === "activities" && !loading && <SellerCrmTimeline items={data || []} />}
      {mode === "settings" && !loading && <div className="space-y-2">{["default_followup_hour", "auto_archive_lost_after_days", "enable_whatsapp_quick_actions", "enable_email_quick_actions", "enable_site_visit_pipeline", "timezone"].map((k) => <div key={k}><label>{humanize(k)}</label><input className="border ml-2" value={String(settingsDraft?.[k] ?? "")} onChange={(e) => setSettingsDraft((s) => ({ ...s, [k]: e.target.value === "true" ? true : e.target.value === "false" ? false : e.target.value }))} /></div>)}<button className="border rounded px-3 py-1" disabled={saving} onClick={() => action("/api/seller/crm/settings", "PATCH", settingsDraft)}>Save settings</button></div>}
    </div>
  );
}
