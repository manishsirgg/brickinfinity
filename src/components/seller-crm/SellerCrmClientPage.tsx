"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { formatCurrency, formatDateTime, humanize } from "@/lib/seller-crm/format";
import { SellerCrmStatusBadge } from "./SellerCrmBadges";
import { buildPropertyHref, getContactPropertyId, getContactPropertySlug } from "@/lib/seller-crm/property-link";

type Mode = "overview" | "contacts" | "contact-detail" | "deals" | "deal-detail" | "followups" | "activities" | "settings";
const stages = ["new","contacted","qualified","site_visit","negotiation","converted","lost","archived"];
const temps = ["cold","warm","hot"];
const channels = ["call","whatsapp","email","sms","meeting","site_visit","system","other"];

const inr = (v: any) => formatCurrency(Number(v || 0));
const wp = (raw?: string | null) => { if (!raw) return null; const d = raw.replace(/\D/g, ""); return d.length===10?`91${d}`:d; };
function asArray<T = any>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === "object") {
    const objectValue = value as Record<string, unknown>;
    if (Array.isArray(objectValue.data)) return objectValue.data as T[];
    if (Array.isArray(objectValue.contacts)) return objectValue.contacts as T[];
    if (Array.isArray(objectValue.activities)) return objectValue.activities as T[];
    if (Array.isArray(objectValue.followups)) return objectValue.followups as T[];
    if (Array.isArray(objectValue.notes)) return objectValue.notes as T[];
    if (Array.isArray(objectValue.deals)) return objectValue.deals as T[];
    if (Array.isArray(objectValue.items)) return objectValue.items as T[];
  }
  return [];
}

function safeMetadata(value: unknown): Record<string, any> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, any>;
  }
  return {};
}

function safeText(value: unknown, fallback = "—"): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}
const formatDateSafe = (value: unknown) => {
  if (!value) return "—";
  const d = new Date(value as string);
  if (Number.isNaN(d.getTime())) return "—";
  return formatDateTime(d.toISOString());
};
const propertyHref = (source:any) => {
  const directHref = source?.property_summary?.href;
  if (directHref) return directHref;
  const summary = source?.property_summary;
  return buildPropertyHref({ id: summary?.id ?? getContactPropertyId(source), slug: summary?.slug ?? getContactPropertySlug(source) });
};
const propertyPriceLabel = (summary: any) => {
  if (!summary) return "—";
  if (summary.monthly_rate) return `${inr(summary.monthly_rate)} / month`;
  if (summary.daily_rate) return `${inr(summary.daily_rate)} / day`;
  if (summary.hourly_rate) return `${inr(summary.hourly_rate)} / hour`;
  if (summary.price) return inr(summary.price);
  return "—";
};

const defaultSummary = {
  totalContacts: 0,
  newContacts: 0,
  hotLeads: 0,
  followupsDueToday: 0,
  overdueFollowups: 0,
  openDeals: 0,
  convertedContacts: 0,
  lostContacts: 0,
  recentContacts: [] as any[],
  recentActivities: [] as any[],
};

export function SellerCrmClientPage({ title, mode="overview", id }: { title: string; subtitle?: string; mode?: Mode; id?: string }) {
  const [data, setData] = useState<any>(null);
  const [aux, setAux] = useState<any>({});
  const [tab, setTab] = useState("Overview");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [settingsDraft, setSettingsDraft] = useState<Record<string, any>>({});
  const [contactFilters, setContactFilters] = useState<any>({ q:"", lifecycle_stage:"", lead_temperature:"", source:"", archived:"active", sort:"newest" });
  const [activityFilters, setActivityFilters] = useState<any>({ activity_type:"", channel:"" });

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const path = mode === "contact-detail" ? `/api/seller/crm/contacts/${id}` : mode === "deal-detail" ? `/api/seller/crm/deals/${id}` : mode === "activities" ? `/api/seller/crm/activities?${new URLSearchParams(activityFilters).toString()}` : mode === "settings" ? "/api/seller/crm/settings" : mode === "contacts" ? `/api/seller/crm/contacts?${new URLSearchParams(contactFilters).toString()}` : mode === "deals" ? "/api/seller/crm/deals" : mode === "followups" ? "/api/seller/crm/followups" : "/api/seller/crm/summary";
      const response = await fetch(path);
      const j = await response.json();
      if (!j.ok) {
        if (mode === "contact-detail" && response.status === 404) {
          setData(null);
          throw new Error("This CRM contact does not belong to your seller account.");
        }
        throw new Error(j.error || "Failed to load");
      }
      const payload = j?.data;
      if (mode === "overview") {
        const counts = payload?.counts ?? {};
        setData({
          ...defaultSummary,
          totalContacts: Number(payload?.totalContacts ?? counts.total_contacts ?? 0),
          newContacts: Number(payload?.newContacts ?? counts.new_contacts ?? 0),
          hotLeads: Number(payload?.hotLeads ?? counts.hot_leads ?? 0),
          followupsDueToday: Number(payload?.followupsDueToday ?? counts.due_today_followups ?? 0),
          overdueFollowups: Number(payload?.overdueFollowups ?? counts.overdue_followups ?? 0),
          openDeals: Number(payload?.openDeals ?? counts.open_deals ?? 0),
          convertedContacts: Number(payload?.convertedContacts ?? counts.converted_contacts ?? 0),
          lostContacts: Number(payload?.lostContacts ?? counts.lost_contacts ?? 0),
          recentContacts: asArray(payload?.recentContacts ?? payload?.recent_contacts ?? payload),
          recentActivities: asArray(payload?.recentActivities ?? payload?.recent_activities ?? payload),
        });
      } else if (mode === "activities") {
        setData(asArray(payload?.activities ?? payload?.data ?? payload));
      } else if (mode === "contacts") {
        setData(asArray(payload?.contacts ?? payload?.data ?? payload));
      } else if (mode === "followups") {
        setData(asArray(payload?.followups ?? payload?.data ?? payload));
      } else if (mode === "deals") {
        setData(asArray(payload?.deals ?? payload?.data ?? payload));
      } else {
        setData(payload ?? null);
      }
      if (mode === "settings") setSettingsDraft((payload?.settings && typeof payload.settings === "object") ? payload.settings : (payload ?? {}));
      if (mode === "contact-detail") {
        const [n,f,d,a] = await Promise.all([fetch(`/api/seller/crm/notes?contact_id=${id}`), fetch("/api/seller/crm/followups"), fetch("/api/seller/crm/deals"), fetch(`/api/seller/crm/activities?contact_id=${id}`)]);
        const [nj,fj,dj,aj] = await Promise.all([n.json(),f.json(),d.json(),a.json()]);
setAux({notes:asArray(nj?.notes ?? nj?.data ?? nj), followups:asArray(fj?.followups ?? fj?.data ?? fj).filter((x:any)=>x?.contact_id===id), deals:asArray(dj?.deals ?? dj?.data ?? dj).filter((x:any)=>x?.contact_id===id), timeline:asArray(aj?.activities ?? aj?.data?.activities ?? aj?.data ?? aj)});
      }
    } catch (e:any) { console.error("[SellerCrmClientPage/load]", e); setError(e.message || "Failed to load CRM data. Please retry."); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [mode,id,JSON.stringify(contactFilters),JSON.stringify(activityFilters)]);

  const action = async (url:string, method:string, body:any, success="Saved") => {
    setSaving(true); setError(null); setOkMsg(null);
    try {
      const response = await fetch(url, { method, headers:{"Content-Type":"application/json"}, body:JSON.stringify(body)});
      const responseTextOrJson = await response.text();
      let json: any = null;
      try { json = responseTextOrJson ? JSON.parse(responseTextOrJson) : null; } catch {}

      if (!response.ok || json?.success === false || json?.ok === false) {
        const apiError = typeof json?.error === "string" && json.error.trim() ? json.error : null;
        const safeMessage = (response.status === 403 || response.status === 404) && apiError
          ? apiError
          : response.status === 404 && mode === "contact-detail"
            ? "This contact could not be updated because it does not belong to your seller account."
            : (response.status === 403 || response.status === 404)
            ? "Could not update contact. Please refresh and try again."
            : (apiError || "Could not update contact. Please try again.");
        const failure: any = new Error(safeMessage);
        failure.status = response.status;
        failure.responseTextOrJson = json ?? responseTextOrJson;
        throw failure;
      }

      if (mode === "contact-detail" && method === "PATCH" && url.startsWith("/api/seller/crm/contacts/")) {
        const updatedContact = json?.contact ?? json?.data?.contact ?? json?.data;
        let mergedLocally = false;
        if (updatedContact && typeof updatedContact === "object") {
          mergedLocally = true;
          setData((prev:any) => ({ ...(prev ?? {}), ...updatedContact }));
        }
        setOkMsg(success);
        try {
          await load();
        } catch {
          if (!mergedLocally) throw new Error("Contact updated but could not refresh latest data.");
        }
        return true;
      }
      setOkMsg(success);
      await load();
      return true;
    }
    catch(e:any){
      if (mode === "contact-detail" && method === "PATCH" && url.startsWith("/api/seller/crm/contacts/")) {
        const updateField = Object.prototype.hasOwnProperty.call(body ?? {}, "lifecycle_stage") ? "lifecycle_stage" : (Object.prototype.hasOwnProperty.call(body ?? {}, "lead_temperature") ? "lead_temperature" : "unknown");
        const updateValue = updateField === "lifecycle_stage" ? body?.lifecycle_stage : (updateField === "lead_temperature" ? body?.lead_temperature : undefined);
        console.error("[seller-crm-contact] update failed", {
          id,
          field: updateField,
          value: updateValue,
          status: e?.status,
          responseTextOrJson: e?.responseTextOrJson ?? e?.message,
        });
        setError(e?.message || "Could not update contact. Please try again.");
      } else {
        console.error("[SellerCrmClientPage/action]", e);
        setError(e.message||"Save failed");
      }
      return false;
    }
    finally{ setSaving(false); }
  };

  const logAndOpen = (contact:any, type:"call"|"whatsapp"|"email") => {
    if(type==="call"&&contact?.phone) window.open(`tel:${contact.phone}`,"_self");
    if(type==="whatsapp"&&wp(contact?.whatsapp_number||contact?.phone)) window.open(`https://wa.me/${wp(contact?.whatsapp_number||contact?.phone)}`,"_blank","noopener,noreferrer");
    if(type==="email"&&contact?.email) window.open(`mailto:${contact.email}`,"_self");
    fetch("/api/seller/crm/activities/log-action",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({contact_id:contact.id,channel:type,activity_type:type})}).catch(()=>{});
  };

  const followupBuckets = useMemo(()=>{ const now=Date.now(), today=(new Date()).toDateString(); const arr=asArray(data); return {overdue:arr.filter((x:any)=>x?.status==="scheduled"&&x?.due_at&&new Date(x.due_at).getTime()<now),today:arr.filter((x:any)=>x?.status==="scheduled"&&x?.due_at&&new Date(x.due_at).toDateString()===today),upcoming:arr.filter((x:any)=>x?.status==="scheduled"&&x?.due_at&&new Date(x.due_at).getTime()>now&&new Date(x.due_at).toDateString()!==today),completed:arr.filter((x:any)=>x?.status==="completed"),cancelled:arr.filter((x:any)=>x?.status==="cancelled"),missed:arr.filter((x:any)=>x?.status==="missed")}; },[data]);

  return <div className="max-w-7xl mx-auto px-4 py-8 space-y-4">
    <h1 className="text-2xl font-bold">{title}</h1>
    {error && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
    {error && !loading && !(mode==="contact-detail" && data) && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">CRM data could not be loaded. Please refresh.</div>}
    {okMsg && <div className="rounded border border-green-200 bg-green-50 p-3 text-sm text-green-700">{okMsg}</div>}
    {loading && <div className="rounded-xl border bg-white p-4 text-sm text-gray-600">Loading…</div>}

    {!loading && mode==="overview" && <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{[
        ["Total contacts", data?.totalContacts],["New contacts",data?.newContacts],["Hot leads",data?.hotLeads],["Due today",data?.followupsDueToday],["Overdue",data?.overdueFollowups]
      ].map(([k,v])=><div key={String(k)} className="rounded-xl border bg-white p-4"><p className="text-xs text-gray-500">{k}</p><p className="text-2xl font-semibold text-slate-800">{Number(v||0)}</p></div>)}</div>
      <div className="grid gap-4 lg:grid-cols-2"><div className="rounded-xl border bg-white p-4"><p className="font-medium mb-2">Recent contacts</p>{asArray(data?.recentContacts).slice(0,5).map((c:any, idx:number)=><div key={c?.id ?? `recent-contact-${idx}`}><Link className="underline" href={`/seller/crm/contacts/${c?.id}`}>{safeText(c?.full_name, "Unnamed contact")}</Link></div>)}</div><div className="rounded-xl border bg-white p-4"><p className="font-medium mb-2">Recent activities</p>{asArray(data?.recentActivities).slice(0,5).map((a:any, idx:number)=><div key={a?.id ?? `recent-activity-${idx}`} className="text-sm">{safeText(a?.title)} • {formatDateSafe(a?.created_at)}</div>)}</div></div>
    </div>}

    {!loading && mode==="contact-detail" && data && <div className="space-y-3">

      <div className="border rounded p-3"><p className="font-semibold text-lg">{safeText(data?.full_name, "Unnamed contact")}</p><p className="text-sm">{safeText(data?.phone, "")} • {safeText(data?.email, "")} • {safeText(data?.whatsapp_number, "")}</p><p className="text-sm">Source: {safeText(data?.source)} • Stage: {humanize(data?.lifecycle_stage ?? "new")} • Temp: {humanize(data?.lead_temperature ?? "cold")}</p><p className="text-xs text-gray-500">Created {formatDateSafe(data?.created_at)} • Updated {formatDateSafe(data?.updated_at)}</p><div className="mt-2 flex gap-2 flex-wrap"><button className="underline" onClick={()=>logAndOpen(data,"call")}>Call</button><button className="underline" onClick={()=>logAndOpen(data,"whatsapp")}>WhatsApp</button><button className="underline" onClick={()=>logAndOpen(data,"email")}>Email</button>{propertyHref(data) ? <Link className="underline" href={propertyHref(data)!}>View Property</Link> : getContactPropertyId(data) ? <span className="text-gray-500">Property link unavailable</span> : null}</div></div>

      <div className="border rounded p-3 text-sm">
        <p className="font-medium mb-1">Linked Property</p>
        {getContactPropertyId(data) ? <>
          <p>{safeText(data?.property_summary?.title || data?.property_summary?.property_type, "Property")}</p>
          <p className="text-gray-600">{[data?.property_summary?.listing_type, data?.property_summary?.property_type].filter(Boolean).join(" • ") || "—"}</p>
          <p className="text-gray-600">{propertyPriceLabel(data?.property_summary)}</p>
          {propertyHref(data) ? <Link className="underline" href={propertyHref(data)!}>View Property</Link> : <span className="text-gray-500">Property link unavailable</span>}
        </> : <p className="text-gray-500">No property linked.</p>}
      </div>
      <div className="border rounded p-3 grid md:grid-cols-2 gap-2"><select className="border rounded p-2" value={data.lifecycle_stage} onChange={e=>action(`/api/seller/crm/contacts/${data?.id ?? id}`,"PATCH",{lifecycle_stage:e.target.value},"Lifecycle stage updated")} disabled={saving}>{stages.map(s=><option key={s} value={s}>{humanize(s)}</option>)}</select><select className="border rounded p-2" value={data.lead_temperature} onChange={e=>action(`/api/seller/crm/contacts/${data?.id ?? id}`,"PATCH",{lead_temperature:e.target.value},"Lead temperature updated")} disabled={saving}>{temps.map(t=><option key={t} value={t}>{humanize(t)}</option>)}</select></div>
      <div className="border rounded p-3"><p className="font-medium mb-2">Notes</p><button className="border rounded px-2 py-1 text-sm" onClick={()=>{const body=prompt("Note"); if(body?.trim()) action("/api/seller/crm/notes","POST",{body,contact_id:id},"Note added");}}>Add note</button>{(aux.notes||[]).map((n:any)=><div key={n.id} className="border rounded p-2 mt-2"><p className="text-sm">{n.body} {n.is_pinned?"📌":""}{n.is_private?"🔒":""}</p><button className="text-xs underline mr-2" onClick={()=>{const body=prompt("Edit",n.body); if(body?.trim()) action(`/api/seller/crm/notes/${n.id}`,"PATCH",{body},"Note updated");}}>Edit</button><button className="text-xs underline" onClick={()=>action(`/api/seller/crm/notes/${n.id}`,"DELETE",{},"Note deleted")}>Delete</button></div>)}</div>
      <div className="border rounded p-3"><p className="font-medium mb-2">Follow-ups</p><button className="border rounded px-2 py-1 text-sm" onClick={()=>{const title=prompt("Title")||"Follow-up"; action("/api/seller/crm/followups","POST",{title,description:"",due_at:new Date().toISOString(),priority:"medium",channel:"call",contact_id:id},"Follow-up created");}}>Create follow-up</button>{(aux.followups||[]).map((f:any)=><div key={f.id} className="border rounded p-2 mt-2 text-sm">{f.title} • {formatDateSafe(f?.due_at)} • {f.channel} • {f.priority}<div className="mt-1">Status: <SellerCrmStatusBadge value={f.status}/>{f.status==="completed"&&f?.completed_at?` • Completed ${formatDateSafe(f.completed_at)}`:""}{f.status==="cancelled"&&f?.cancelled_at?` • Cancelled ${formatDateSafe(f.cancelled_at)}`:""}{f.status==="missed"&&f?.missed_at?` • Missed ${formatDateSafe(f.missed_at)}`:""}</div>{f.status==="scheduled"&&<div className="flex gap-2"><button className="underline" onClick={()=>action(`/api/seller/crm/followups/${f.id}`,"PATCH",{status:"completed"},"Follow-up completed")}>Complete</button><button className="underline" onClick={()=>action(`/api/seller/crm/followups/${f.id}`,"PATCH",{status:"cancelled"},"Follow-up cancelled")}>Cancel</button><button className="underline" onClick={()=>action(`/api/seller/crm/followups/${f.id}`,"PATCH",{status:"missed"},"Follow-up marked missed")}>Missed</button></div>}</div>)}</div>
      <div className="border rounded p-3"><p className="font-medium mb-2">Deals</p><button className="border rounded px-2 py-1 text-sm" onClick={()=>{const title=prompt("Deal title")||"New deal"; action("/api/seller/crm/deals","POST",{title,contact_id:id},"Deal created");}}>Create deal</button>{(aux.deals||[]).map((d:any)=><div key={d.id} className="text-sm mt-2"><Link className="underline" href={`/seller/crm/deals/${d.id}`}>{d.title}</Link><select className="ml-2 border" value={d.deal_stage} onChange={e=>action(`/api/seller/crm/deals/${d.id}`,"PATCH",{deal_stage:e.target.value},"Deal stage updated")}>{["new","qualified","property_shared","site_visit_scheduled","site_visit_done","negotiation","token_pending","agreement_pending","closed_won","closed_lost"].map(s=><option key={s} value={s}>{humanize(s)}</option>)}</select></div>)}</div>
    </div>}


    {!loading && mode==="contacts" && <div className="space-y-3">{asArray(data).length===0?<div className="rounded border p-3 text-sm text-gray-600">No contacts found.</div>:asArray(data).map((c:any)=><div key={c?.id} className="border rounded p-3 text-sm"><div className="font-medium"><Link className="underline" href={`/seller/crm/contacts/${c?.id}`}>{safeText(c?.full_name, "Unnamed contact")}</Link></div><div>{safeText(c?.phone, "—")} • {humanize(c?.lifecycle_stage ?? "new")} • {humanize(c?.lead_temperature ?? "cold")}</div>{getContactPropertyId(c)&&<div className="mt-1">{safeText(c?.property_summary?.title || c?.property_summary?.property_type, "Linked property")} {propertyHref(c)?<Link className="underline ml-2" href={propertyHref(c)!}>View Property</Link>:<span className="text-gray-500 ml-2">Property link unavailable</span>}</div>}</div>)}</div>}
    {!loading && mode==="followups" && <div className="grid gap-3 md:grid-cols-2">{Object.entries(followupBuckets).map(([k,items])=><div key={k} className="border rounded p-3"><p className="font-semibold mb-2">{humanize(k)}</p>{(items as any[]).map(f=><div key={f.id} className="border rounded p-2 text-sm mb-2">{f.title} • {formatDateSafe(f?.due_at)} • {f.channel} • <SellerCrmStatusBadge value={f.status}/>{f.status==="completed"&&f?.completed_at?` • Completed ${formatDateSafe(f.completed_at)}`:""}{f.status==="cancelled"&&f?.cancelled_at?` • Cancelled ${formatDateSafe(f.cancelled_at)}`:""}{f.status==="missed"&&f?.missed_at?` • Missed ${formatDateSafe(f.missed_at)}`:""}{f.status==="scheduled"&&<div className="flex gap-2"><button className="underline" onClick={()=>action(`/api/seller/crm/followups/${f.id}`,"PATCH",{status:"completed"},"Follow-up completed")}>Complete</button><button className="underline" onClick={()=>action(`/api/seller/crm/followups/${f.id}`,"PATCH",{status:"cancelled"},"Follow-up cancelled")}>Cancel</button><button className="underline" onClick={()=>action(`/api/seller/crm/followups/${f.id}`,"PATCH",{status:"missed"},"Follow-up marked missed")}>Missed</button></div>}</div>)}</div>)}</div>}

    {!loading && mode==="activities" && <div className="space-y-3"><div className="grid md:grid-cols-3 gap-2"><select className="border rounded p-2" value={activityFilters.activity_type} onChange={e=>setActivityFilters((s:any)=>({...s,activity_type:e.target.value}))}><option value="">All activity types</option>{["lead_created","call","whatsapp","email","note","stage_change","deal_created","deal_updated","followup_created","followup_completed","converted","lost","system"].map(x=><option key={x} value={x}>{humanize(x)}</option>)}</select><select className="border rounded p-2" value={activityFilters.channel} onChange={e=>setActivityFilters((s:any)=>({...s,channel:e.target.value}))}><option value="">All channels</option>{channels.map(x=><option key={x} value={x}>{humanize(x)}</option>)}</select></div>{asArray(data).length===0?<div className="rounded border p-3 text-sm text-gray-600">No activities found.</div>:asArray(data).map((a:any)=><div key={a?.id ?? `${a?.activity_type}-${a?.created_at}`} className="border rounded p-3 text-sm"><div className="font-medium">{safeText(a?.title, humanize(a?.activity_type ?? "system"))}</div><div>{humanize(a?.activity_type ?? "system")} • {humanize(a?.channel ?? "other")}</div><div>{safeText(a?.body)}</div><div>{a?.contact_name ?? "Unknown contact"} {(a?.property_id || getContactPropertyId(a)) ? (propertyHref(a) ? <Link className="underline ml-2" href={propertyHref(a)!}>View Property</Link> : <span className="text-gray-500 ml-2">Property link unavailable</span>) : null}</div><div className="text-xs text-gray-500">{formatDateSafe(a?.created_at)}</div></div>)}</div>}

    {!loading && mode==="settings" && <div className="space-y-2">{["default_followup_hour","auto_archive_lost_after_days","timezone"].map(k=><div key={k}><label>{humanize(k)}</label><input className="border ml-2" value={String(settingsDraft?.[k]??"")} onChange={e=>setSettingsDraft((s:any)=>({...s,[k]:e.target.value}))}/></div>)}{["enable_whatsapp_quick_actions","enable_email_quick_actions","enable_site_visit_pipeline"].map(k=><label key={k} className="block"><input type="checkbox" checked={Boolean(settingsDraft?.[k])} onChange={e=>setSettingsDraft((s:any)=>({...s,[k]:e.target.checked}))}/> {humanize(k)}</label>)}<button className="border rounded px-3 py-1" onClick={()=>action("/api/seller/crm/settings","PATCH",settingsDraft,"Settings saved")}>Save settings</button></div>}
  </div>
}
