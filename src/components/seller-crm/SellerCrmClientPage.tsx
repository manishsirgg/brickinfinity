"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { formatCurrency, formatDateTime, formatRelativeDueStatus, humanize } from "@/lib/seller-crm/format";
import { SellerCrmActivityBadge, SellerCrmChannelBadge, SellerCrmPriorityBadge, SellerCrmStageBadge, SellerCrmStatusBadge, SellerCrmTemperatureBadge } from "./SellerCrmBadges";
import { SellerCrmTimeline } from "./SellerCrmTimeline";
import { SellerCrmActivityFilters, SellerCrmContactFilters, SellerCrmDealFilters, SellerCrmFollowupFilters } from "./SellerCrmFilters";

type Props = { title: string; subtitle?: string; endpoint?: string; mode?: "overview"|"contacts"|"contact-detail"|"deals"|"deal-detail"|"followups"|"activities"|"settings"; id?: string };
const card = "rounded-xl border bg-white p-4";

export function SellerCrmClientPage({ title, subtitle, mode="overview", id }: Props) {
  const [data, setData] = useState<any>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const load = async () => {
    setLoading(true); setError(null);
    try {
      const path = mode === "overview" ? "/api/seller/crm/summary" : mode === "contacts" ? "/api/seller/crm/contacts" : mode==="contact-detail" ? `/api/seller/crm/contacts/${id}` : mode==="deals" ? "/api/seller/crm/deals" : mode==="deal-detail" ? `/api/seller/crm/deals/${id}` : mode==="followups" ? "/api/seller/crm/followups" : mode==="activities" ? "/api/seller/crm/activities" : "/api/seller/crm/settings";
      const r = await fetch(path); const j = await r.json(); if (!j.ok) throw new Error(j.error || "Request failed"); setData(j.data);
    } catch (e:any) { setError(e.message); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [mode, id]);

  const contacts = useMemo(() => (mode==="contacts" && Array.isArray(data)) ? data.filter((x:any)=>[x.full_name,x.phone,x.email].join(" ").toLowerCase().includes(q.toLowerCase())):[], [data, q, mode]);

  return <div className="max-w-7xl mx-auto px-4 py-8 space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-bold">{title}</h1>{subtitle&&<p className="text-gray-500">{subtitle}</p>}</div>
      <div className="flex gap-2 text-sm">{["/seller/crm/contacts","/seller/crm/followups","/seller/crm/deals"].map((href,i)=><Link key={href} href={href} className="px-3 py-2 rounded-lg border">{["Add Contact","Add Follow-up","Add Deal"][i]}</Link>)}</div></div>
    {loading ? <div className={card}>Loading...</div> : error ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">{error}</div> : (
      <>
        {mode==="overview" && <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">{[
            ["Total Contacts", data?.dashboard?.total_contacts],["Hot Leads", data?.dashboard?.hot_leads],["Follow-ups Today", data?.dashboard?.followups_today],["Overdue Follow-ups", data?.dashboard?.overdue_followups],["Open Deals", data?.dashboard?.open_deals],["Pipeline Value", formatCurrency(data?.dashboard?.pipeline_value)]
          ].map(([k,v])=><div key={String(k)} className={card}><div className="text-xs text-gray-500">{k}</div><div className="text-xl font-semibold">{v ?? 0}</div></div>)}</div>
          <div className={card}>Your CRM is ready. Add your first buyer, tenant, owner, or investor lead.</div>
        </div>}
        {mode==="contacts" && <div className="space-y-3"><input value={q} onChange={(e)=>setQ(e.target.value)} placeholder="Search contacts" className="w-full md:w-72 border rounded-lg px-3 py-2"/><SellerCrmContactFilters value="" onChange={()=>{}} options={[{label:"Active",value:"active"},{label:"Archived",value:"archived"}]}/>{contacts.length===0?<div className={card}>No contacts found.</div>:<div className="grid md:grid-cols-2 gap-3">{contacts.map((c:any)=><div className={card} key={c.id}><div className="font-semibold">{c.full_name}</div><div className="text-sm text-gray-600">{c.phone||c.email||"—"}</div><div className="text-xs mt-2">{humanize(c.contact_type)} • <SellerCrmStageBadge value={c.lifecycle_stage} /> • <SellerCrmTemperatureBadge value={c.lead_temperature} /></div><div className="text-xs">Budget: {formatCurrency(c.budget_min)} - {formatCurrency(c.budget_max)}</div><div className="text-xs">Next follow-up: {formatRelativeDueStatus(c.next_followup_at)}</div><div className="mt-3 flex gap-2 text-xs"><Link href={`/seller/crm/contacts/${c.id}`} className="border rounded px-2 py-1">View</Link></div></div>)}</div>}</div>}
        {mode==="contact-detail" && <div className="space-y-3"><div className={card}><div className="text-xl font-semibold">{data.full_name}</div><div className="text-sm">{data.phone} {data.whatsapp_number?`• WA ${data.whatsapp_number}`:""} {data.email?`• ${data.email}`:""}</div><div className="text-xs mt-2">{humanize(data.contact_type)} • {humanize(data.lifecycle_stage)} • {humanize(data.lead_temperature)}</div></div><div className={card}>Notes: {data.notes||"No notes"}</div></div>}
        {mode==="deals" && <div className="grid md:grid-cols-3 gap-3">{(data||[]).map((d:any)=><div key={d.id} className={card}><div className="font-semibold">{d.title}</div><div className="text-xs">{humanize(d.deal_stage)} • {humanize(d.deal_type)}</div><div className="text-xs">Expected: {formatCurrency(d.expected_value)}</div><div className="text-xs">Close: {formatDateTime(d.expected_close_date)}</div><Link href={`/seller/crm/deals/${d.id}`} className="mt-2 inline-block text-xs border rounded px-2 py-1">View</Link></div>)}</div>}
        {mode==="deal-detail" && <div className={card}><div className="font-semibold text-xl">{data.title}</div><div className="text-sm">Stage: {humanize(data.deal_stage)}</div><div className="text-sm">Expected: {formatCurrency(data.expected_value)} | Final: {formatCurrency(data.final_value)}</div></div>}
        {mode==="followups" && <div className="space-y-2">{(data||[]).map((f:any)=><div key={f.id} className={card}><div className="font-semibold">{f.title}</div><div className="text-xs"><SellerCrmStatusBadge value={f.status} /> <SellerCrmPriorityBadge value={f.priority} /> <SellerCrmChannelBadge value={f.channel} /></div><div className="text-xs">Due: {formatDateTime(f.due_at)} ({formatRelativeDueStatus(f.due_at)})</div></div>)}</div>}
        {mode==="activities" && <SellerCrmTimeline items={data || []} />}
        {mode==="settings" && <div className="grid md:grid-cols-2 gap-3">{Object.entries(data?.settings||{}).map(([k,v])=><div key={k} className={card}><div className="text-xs text-gray-500">{humanize(k)}</div><div className="font-medium">{String(v)}</div></div>)}<div className={card}><div className="font-semibold mb-2">Default Pipeline Stages</div><ul className="text-sm list-disc pl-5 space-y-1">{(data?.stages||[]).map((s:any)=><li key={s.id}>{s.label||humanize(s.code)}</li>)}</ul></div></div>}
      </>
    )}
  </div>;
}
