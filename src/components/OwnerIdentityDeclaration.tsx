"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
export default function OwnerIdentityDeclaration({ onSaved, initialIdentity }: { onSaved:()=>void | Promise<void>; initialIdentity?: string | null }) {
 const router = useRouter();
 const [identity,setIdentity]=useState(initialIdentity || 'owner');const [accepted,setAccepted]=useState(false);const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');
 return <section className="space-y-3 rounded-xl border p-4"><h3 className="font-semibold">Owner-only listing declaration</h3><p className="text-sm">BrickInfinity does not accept agents, brokers, channel partners or marketing intermediaries. KYC verifies identity; each property/project requires separate ownership approval.</p>
 <label className="block text-sm">Listing capacity<select aria-label="Listing capacity" className="mt-1 w-full rounded-lg border p-2" value={identity} onChange={e=>{setIdentity(e.target.value);setAccepted(false);}}><option value="owner">I list properties I actually own</option><option value="project_owner_builder">My builder company owns the projects it lists</option></select></label>
 <label className="flex gap-2 text-sm"><input type="checkbox" checked={accepted} onChange={e=>setAccepted(e.target.checked)}/>I accept the owner-only policy and will supply matching ownership evidence. I am not listing as an agent or broker.</label>
 <button type="button" className="btn-primary" disabled={!accepted||busy} onClick={async()=>{setBusy(true);try{const {error}=await createClient().rpc('declare_owner_identity',{p_identity:identity,p_accept:accepted});if(error)throw new Error(error.message);setMessage('Owner declaration recorded. Check Seller dashboard access above for any remaining identity or activation steps.');await onSaved();router.refresh();}catch(e){setMessage(e instanceof Error?e.message:'Could not save declaration.');}finally{setBusy(false);}}}>{busy?'Saving…':'Save owner declaration'}</button>{message&&<p role="status" className="text-sm">{message}</p>}</section>;
}
