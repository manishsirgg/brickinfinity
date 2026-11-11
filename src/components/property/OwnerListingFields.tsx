"use client";
import type { OwnerFields } from "@/lib/owner-verification";
import { ownerKindLabel } from "@/lib/owner-verification";
import Link from "next/link";
export default function OwnerListingFields({ value, onChange, isAdmin = false, declaredOwnerKind }: { value: OwnerFields; onChange: (patch: OwnerFields) => void; isAdmin?: boolean; declaredOwnerKind?: string | null }) {
  const cls="mt-1 block w-full rounded-lg border bg-white px-3 py-2";
  return <section className="space-y-4 rounded-xl border p-4"><h3 className="font-semibold">Actual property ownership</h3><p className="text-sm text-slate-600">Only actual owners, builders who own the project, and BrickInfinity admins may list. Agents, brokers, channel partners and marketing intermediaries are not permitted. Ownership evidence must identify this property and its legal owner.</p>
    {value.owner_kind === "project_owner_builder" && <p className="text-sm text-slate-600">Use the owning company’s verified account. Supply company identity, project ownership and responsible company signatory evidence. A brochure, contractor agreement or marketing authorization alone is not sufficient.</p>}
    {isAdmin && <p className="text-sm">Admin listings are labeled Listed by BrickInfinity. Ownership badges require separate evidence review.</p>}
    {!isAdmin && <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950"><p>Owner category: <strong>{ownerKindLabel(declaredOwnerKind ?? value.owner_kind)}</strong></p><p>Filled automatically from your Profile declaration. <Link className="underline" href="/profile#seller-access">Change your declaration on Profile</Link>. Changing the declaration can require ownership re-review of your existing listings.</p></div>}
    {isAdmin && <label className="block text-sm">Property owner category (admin)<select aria-label="Property owner category (admin)" className={cls} value={value.owner_kind || ""} onChange={e=>onChange({owner_kind:e.target.value,owner_attested:false})}><option value="">Select owner category</option><option value="owner">Actual property owner</option><option value="project_owner_builder">Builder company that owns this project</option></select></label>}
    <label className="block text-sm">Legal owner / owning company<input aria-label="Legal owner / owning company" maxLength={200} className={cls} value={value.owner_legal_name || ""} onChange={e=>onChange({owner_legal_name:e.target.value,owner_attested:false})}/></label>
    <p className="text-xs text-slate-600">We prefill an approved profile name or previously reviewed owning-company name when available. It must match this property's ownership documents. Correcting the name requires ownership confirmation and re-review.</p>
    {value.owner_kind==='project_owner_builder' && <label className="block text-sm">Project owned by the company<input aria-label="Project owned by the company" maxLength={200} className={cls} value={value.owner_project_name || ""} onChange={e=>onChange({owner_project_name:e.target.value,owner_attested:false})}/></label>}
    <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={!!value.owner_attested} onChange={e=>onChange({owner_attested:e.target.checked})}/>I confirm the named person/company actually owns this property or project. I am not acting as an agent, broker or marketing intermediary.</label>
    <p className="text-xs text-slate-600">This confirmation applies to this property. Routine edits keep it; ownership or location changes require confirmation again.</p>
  </section>;
}
