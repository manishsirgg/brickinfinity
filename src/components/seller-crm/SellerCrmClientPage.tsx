"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { formatCurrency, formatDateTime, humanize } from "@/lib/seller-crm/format";
import { SellerCrmTimeline } from "./SellerCrmTimeline";

export function SellerCrmClientPage({ title, mode="overview", id }: any) {
  const [data, setData] = useState<any>(null); const [aux,setAux]=useState<any>({}); const [tab,setTab]=useState("Overview");
  const load = async () => {
    const path = mode === "contact-detail" ? `/api/seller/crm/contacts/${id}` : mode==="deal-detail" ? `/api/seller/crm/deals/${id}` : mode==="activities" ? "/api/seller/crm/activities" : mode==="settings" ? "/api/seller/crm/settings" : mode==="contacts" ? "/api/seller/crm/contacts" : mode==="deals" ? "/api/seller/crm/deals" : mode==="followups" ? "/api/seller/crm/followups" : "/api/seller/crm/summary";
    const j = await (await fetch(path)).json(); if (j.ok) setData(j.data);
    if (mode==="contact-detail") {
      const [n,f,d,a]=await Promise.all([fetch(`/api/seller/crm/notes?contact_id=${id}`),fetch(`/api/seller/crm/followups`),fetch(`/api/seller/crm/deals`),fetch(`/api/seller/crm/activities?contact_id=${id}`)]);
      const [nj,fj,dj,aj]=await Promise.all([n.json(),f.json(),d.json(),a.json()]); setAux({notes:nj.data||[],followups:(fj.data||[]).filter((x:any)=>x.contact_id===id),deals:(dj.data||[]).filter((x:any)=>x.contact_id===id),timeline:aj.data||[]});
    }
    if (mode==="deal-detail") {
      const [n,f,a]=await Promise.all([fetch(`/api/seller/crm/notes?deal_id=${id}`),fetch(`/api/seller/crm/followups`),fetch(`/api/seller/crm/activities?deal_id=${id}`)]);
      const [nj,fj,aj]=await Promise.all([n.json(),f.json(),a.json()]); setAux({notes:nj.data||[],followups:(fj.data||[]).filter((x:any)=>x.deal_id===id),timeline:aj.data||[]});
    }
  }; useEffect(()=>{load();},[mode,id]);

  const action = async (url:string, method:string, body:any)=>{await fetch(url,{method,headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}); await load();};
  const tabs = mode==="contact-detail"?["Overview","Follow-ups","Deals","Notes","Timeline"]:mode==="deal-detail"?["Overview","Follow-ups","Notes","Timeline"]:[];
  return <div className="max-w-7xl mx-auto px-4 py-8 space-y-4"><h1 className="text-2xl font-bold">{title}</h1>
    {mode==="contact-detail" && <div className="flex gap-2 flex-wrap">{tabs.map((t:any)=><button key={t} onClick={()=>setTab(t)} className="border rounded px-3 py-1">{t}</button>)}<button className="border rounded px-2" onClick={()=>action(`/api/seller/crm/contacts/${id}`,"PATCH",{lifecycle_stage:"converted"})}>Mark Converted</button><button className="border rounded px-2" onClick={()=>action(`/api/seller/crm/contacts/${id}`,"PATCH",{lifecycle_stage:"lost"})}>Mark Lost</button><button className="border rounded px-2" onClick={()=>action(`/api/seller/crm/contacts/${id}`,"PATCH",{is_archived:true})}>Archive</button><button className="border rounded px-2" onClick={()=>action(`/api/seller/crm/contacts/${id}`,"PATCH",{is_archived:false})}>Restore</button></div>}
    {mode==="deal-detail" && <div className="flex gap-2 flex-wrap">{tabs.map((t:any)=><button key={t} onClick={()=>setTab(t)} className="border rounded px-3 py-1">{t}</button>)}<button className="border rounded px-2" onClick={()=>action(`/api/seller/crm/deals/${id}`,"PATCH",{deal_stage:"closed_won"})}>Mark Won</button><button className="border rounded px-2" onClick={()=>action(`/api/seller/crm/deals/${id}`,"PATCH",{deal_stage:"closed_lost"})}>Mark Lost</button></div>}
    {mode==="contact-detail" && tab==="Overview" && <div className="border rounded p-3">{data?.full_name} • {humanize(data?.lifecycle_stage)}</div>}
    {mode==="deal-detail" && tab==="Overview" && <div className="border rounded p-3">{data?.title} • {humanize(data?.deal_stage)} • {formatCurrency(data?.expected_value)}</div>}
    {(["contact-detail","deal-detail"] as any).includes(mode) && tab==="Notes" && <div className="space-y-2"><button className="border rounded px-2" onClick={()=>{const body=prompt("Note body"); if(body) action('/api/seller/crm/notes','POST',{body,contact_id:mode==='contact-detail'?id:undefined,deal_id:mode==='deal-detail'?id:undefined});}}>Add Note</button>{(aux.notes||[]).map((n:any)=><div key={n.id} className="border rounded p-2"><div>{n.title||"Note"}</div><div className="text-sm">{n.body}</div><button onClick={()=>{const body=prompt('Edit note',n.body); if(body) action(`/api/seller/crm/notes/${n.id}`,'PATCH',{body});}}>Edit</button><button onClick={()=>action(`/api/seller/crm/notes/${n.id}`,'DELETE',{})}>Delete</button></div>)}</div>}
    {(["contact-detail","deal-detail"] as any).includes(mode) && tab==="Follow-ups" && <div className="space-y-2"><button className="border rounded px-2" onClick={()=>action('/api/seller/crm/followups','POST',{title:'New follow-up',due_at:new Date().toISOString(),contact_id:mode==='contact-detail'?id:null,deal_id:mode==='deal-detail'?id:null})}>Add Follow-up</button>{(aux.followups||[]).map((f:any)=><div key={f.id} className="border rounded p-2">{f.title} - {f.status}<button onClick={()=>action(`/api/seller/crm/followups/${f.id}`,'PATCH',{status:'completed'})}>Complete</button><button onClick={()=>action(`/api/seller/crm/followups/${f.id}`,'PATCH',{status:'cancelled'})}>Cancel</button><button onClick={()=>action(`/api/seller/crm/followups/${f.id}`,'PATCH',{status:'scheduled',due_at:new Date(Date.now()+86400000).toISOString()})}>Reschedule</button></div>)}</div>}
    {mode==="contact-detail" && tab==="Deals" && <div><button className="border rounded px-2" onClick={()=>action('/api/seller/crm/deals','POST',{title:'New deal',contact_id:id})}>Create Deal</button>{(aux.deals||[]).map((d:any)=><div key={d.id}><Link href={`/seller/crm/deals/${d.id}`}>{d.title}</Link></div>)}</div>}
    {(["contact-detail","deal-detail"] as any).includes(mode) && tab==="Timeline" && <SellerCrmTimeline items={aux.timeline||[]}/>}    
    {mode==="activities" && <SellerCrmTimeline items={data || []} />}
    {mode==="settings" && <div className="space-y-2">{["default_followup_hour","auto_archive_lost_after_days","enable_whatsapp_quick_actions","enable_email_quick_actions","enable_site_visit_pipeline","timezone"].map((k)=><div key={k}><label>{k}</label><input className="border ml-2" defaultValue={String(data?.settings?.[k]??"")} onBlur={(e)=>action('/api/seller/crm/settings','PATCH',{[k]: e.target.value==='true'?true:e.target.value==='false'?false:e.target.value})}/></div>)}</div>}
  </div>;
}
