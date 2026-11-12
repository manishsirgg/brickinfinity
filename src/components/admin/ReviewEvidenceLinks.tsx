"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
type Evidence = { id: string; label: string; status: string; url: string | null; expired: string | null };
export default function ReviewEvidenceLinks({ userId, propertyId }: { userId: string; propertyId: string }) {
 const [items,setItems]=useState<Evidence[]>([]);const [error,setError]=useState('');const [revision,setRevision]=useState(0);
 useEffect(()=>{let cancelled=false;setItems([]);setError('');const db=createClient();
  void (async()=>{try{
   const [identity,ownership]=await Promise.all([db.from('documents').select('id,document_type,document_url,status,created_at').eq('user_id',userId).is('property_id',null).order('created_at',{ascending:false}),db.from('documents').select('id,document_type,document_url,status,created_at').eq('user_id',userId).eq('property_id',propertyId).eq('document_type','ownership').order('created_at',{ascending:false})]);
   if(identity.error||ownership.error)throw new Error('Evidence records could not be loaded.');
   const seen=new Set<string>();const latest=(identity.data||[]).filter(row=>{if(seen.has(row.document_type))return false;seen.add(row.document_type);return true;});
   const rows=[...latest,...ownership.data||[]];
   const previews=await Promise.all(rows.map(async row=>{
    const bucket=row.document_type==='ownership'?'ownership-documents':'identity-documents';
    const {data}=await db.storage.from(bucket).createSignedUrl(row.document_url,300);
    const expiry=data?.signedUrl?null:await db.rpc('document_expiry_status',{p_bucket:bucket,p_path:row.document_url});
    return {id:row.id,label:row.document_type==='ownership'?'Property/project ownership evidence':row.document_type.replaceAll('_',' '),status:row.status,url:data?.signedUrl||null,expired:expiry?.data||null};
   }));
   if(!cancelled)setItems(previews);
  }catch(error){if(!cancelled)setError(error instanceof Error?error.message:'Evidence could not be loaded.');}})();return()=>{cancelled=true;};
 },[userId,propertyId,revision]);
 return <section className="mb-4 space-y-2 rounded-lg border p-3"><h3 className="font-semibold">Identity and ownership evidence bundle</h3><p className="text-xs text-slate-600">Each status belongs to that document. Identity approval does not approve property ownership. Pending ownership evidence awaits your review. Private preview links expire after five minutes.</p>{error&&<p role="alert" className="text-sm text-red-700">{error}</p>}<ul className="space-y-2 text-sm">{items.map(item=><li key={item.id}>{item.url?<a className="underline" href={item.url} target="_blank" rel="noopener noreferrer">View {item.label}</a>:<span className={item.expired?"text-slate-600":"text-red-700"}>{item.expired?`File expired under retention policy; review record retained: ${item.label}`:`File unavailable: ${item.label}`}</span>} · <span className={item.status==='approved'?'text-emerald-700':item.status==='pending'?'text-amber-800':'text-red-700'}>{item.status==='pending'?'Awaiting document review':item.status==='approved'?'Document approved':item.status==='rejected'?'Document rejected':item.status}</span></li>)}</ul><button type="button" className="rounded border px-3 py-1 text-xs" onClick={()=>setRevision(value=>value+1)}>Refresh private previews</button></section>;
}
