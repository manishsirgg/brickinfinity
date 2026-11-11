"use client";
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ownerKindLabel } from "@/lib/owner-verification";
import { useFormFeedback } from "@/lib/use-form-feedback";
import DeclarationChangeEvidence from "@/components/DeclarationChangeEvidence";

type Request = { id: string; user_id: string; from_identity: string; requested_identity: string; requested_legal_name: string; reason: string; evidence_paths: string[]; created_at: string; users: { full_name: string; email: string; role: string; kyc_status: string; seller_status: string; seller_identity: string } };
const checks = { identity_matches: "The requested legal person/company matches the applicant and identity evidence", capacity_supported: "The supporting documents establish the requested actual-owner or owning-builder capacity", no_agent: "The applicant is not acting as an agent, broker or marketing intermediary" };
const db = createClient();
export default function DeclarationChangeReviewPage() {
  const [queue, setQueue] = useState<Request[]>([]);
  const [selected, setSelected] = useState<Request | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reviewChecks, setReviewChecks] = useState<Record<string, boolean>>({});
  const [note, setNote] = useState("");
  const { feedback, feedbackRef, showFeedback } = useFormFeedback();
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await db.from("declaration_change_requests").select("*,users!inner(full_name,email,role,kyc_status,seller_status,seller_identity)").eq("status", "pending").order("created_at").limit(50);
      if (error) throw new Error(error.message);
      setQueue((data || []) as unknown as Request[]);
    } catch (error) { showFeedback(error instanceof Error ? error.message : "Requests could not be loaded."); }
    finally { setLoading(false); }
  }, [showFeedback]);
  useEffect(() => { void load(); }, [load]);
  function choose(request: Request) { if (busy) return; setSelected(request); setReviewChecks({}); setNote(""); showFeedback(""); }
  async function review(approve: boolean) {
    if (!selected || busy) return;
    if (!note.trim()) { showFeedback("Enter a review note or rejection reason first."); return; }
    setBusy(true); showFeedback("");
    try {
      const { error } = await db.rpc("review_declaration_change", { p_request_id: selected.id, p_approve: approve, p_checks: reviewChecks, p_note: note.trim() });
      if (error) throw new Error(error.message);
      showFeedback(approve ? "Declaration change approved. The effective capacity was updated and affected property ownership reviews reopened. Account restrictions remain unchanged; no property was republished." : "Declaration change rejected. The effective category and account access remain unchanged.", "success");
      setSelected(null); setReviewChecks({}); setNote(""); await load();
    } catch (error) { showFeedback(error instanceof Error ? error.message : "The decision could not be saved. Your note is retained."); }
    finally { setBusy(false); }
  }
  return <main className="mx-auto max-w-7xl space-y-6 p-4 sm:p-8">
    <h1 className="text-2xl font-semibold">Declaration change reviews</h1>
    <p className="text-sm text-slate-600">Review category changes after seller verification. Pending requests do not change the effective category or account access. Approval requires current government ID, selfie and supporting evidence. It never lifts a suspension or automatically publishes properties.</p>
    {feedback.text && <div ref={feedbackRef} tabIndex={-1} role={feedback.kind === "error" ? "alert" : "status"} className={`rounded-lg border p-4 outline-none ${feedback.kind === "error" ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{feedback.text}</div>}
    <div className="grid min-w-0 gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="min-w-0 space-y-3 rounded-xl border p-4"><h2 className="font-semibold">Pending requests</h2>{loading && <p>Loading requests…</p>}{!loading && !queue.length && <p>No pending declaration changes</p>}{queue.map(request => <button type="button" key={request.id} disabled={busy} className={`block w-full rounded-lg border p-3 text-left ${selected?.id === request.id ? "bg-slate-100" : ""}`} onClick={() => choose(request)}><span className="block font-semibold">{request.users.full_name}</span><span className="block text-sm">{ownerKindLabel(request.from_identity)} → {ownerKindLabel(request.requested_identity)}</span><span className="text-xs">{new Date(request.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</span></button>)}<button type="button" disabled={busy} onClick={() => void load()} className="text-sm underline">Refresh requests</button></aside>
      <section className="min-w-0 space-y-4 rounded-xl border p-4">{!selected ? <p>Select a request to review</p> : <>
        <h2 className="text-lg font-semibold">{selected.users.full_name}</h2><p className="break-all text-sm">{selected.users.email}</p>
        <p className="text-sm">Effective category: <strong>{ownerKindLabel(selected.users.seller_identity)}</strong></p>
        <p className="text-sm">Requested category: <strong>{ownerKindLabel(selected.requested_identity)}</strong></p>
        <p className="text-sm">Requested legal owner/company: <strong>{selected.requested_legal_name}</strong></p>
        <p className="whitespace-pre-wrap break-words text-sm">Reason: {selected.reason}</p>
        <p className="text-sm">Identity: {selected.users.kyc_status} · Role: {selected.users.role} · Seller status: {selected.users.seller_status}. These access restrictions will not be lifted by this review.</p>
        <DeclarationChangeEvidence userId={selected.user_id} paths={selected.evidence_paths} includeIdentity />
        {Object.entries(checks).map(([key, label]) => <label key={key} className="flex gap-2 text-sm"><input type="checkbox" disabled={busy} checked={!!reviewChecks[key]} onChange={event => setReviewChecks(previous => ({ ...previous, [key]: event.target.checked }))} />{label}</label>)}
        <label className="block text-sm">Review note / rejection reason (required)<textarea maxLength={4000} value={note} disabled={busy} onChange={event => setNote(event.target.value)} className="mt-2 block w-full rounded-lg border p-2" /></label>
        <div className="flex flex-wrap gap-3"><button type="button" disabled={busy || !note.trim() || !Object.keys(checks).every(key => reviewChecks[key])} onClick={() => void review(true)} className="rounded bg-green-700 px-4 py-2 text-white disabled:opacity-40">Approve category change</button><button type="button" disabled={busy || !note.trim()} onClick={() => void review(false)} className="rounded bg-red-700 px-4 py-2 text-white disabled:opacity-40">Reject category change</button></div>
      </>}</section>
    </div>
  </main>;
}
