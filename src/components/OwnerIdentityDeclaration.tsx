"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ownerKindLabel } from "@/lib/owner-verification";
import DeclarationChangeEvidence from "@/components/DeclarationChangeEvidence";

type ChangeRequest = { id: string; user_id: string; requested_identity: string; requested_legal_name: string; reason: string; evidence_paths: string[]; status: string; review_note: string | null; created_at: string };
export default function OwnerIdentityDeclaration({ onSaved, initialIdentity, profileId, locked = false, legalName = "", personalName = "" }: {
  onSaved: () => void | Promise<void>; initialIdentity?: string | null; profileId?: string; locked?: boolean; legalName?: string; personalName?: string;
}) {
  const router = useRouter();
  const [identity, setIdentity] = useState(initialIdentity || "owner");
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [reason, setReason] = useState("");
  const [name, setName] = useState(legalName);
  const [files, setFiles] = useState<File[]>([]);
  const [requests, setRequests] = useState<ChangeRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const reviewedChange = locked && Boolean(initialIdentity);
  const pending = requests.find(request => request.status === "pending");

  const loadRequests = useCallback(async () => {
    if (!profileId) return;
    setLoadingRequests(true); setLoadFailed(false);
    try {
      const { data, error } = await createClient().from("declaration_change_requests").select("*").eq("user_id", profileId).order("created_at", { ascending: false }).limit(5);
      if (error) throw new Error("Declaration requests could not be loaded. Refresh the status; the declaration-change migration may need to be applied.");
      setRequests((data || []) as ChangeRequest[]);
    } catch (error) { setLoadFailed(true); setError(error instanceof Error ? error.message : "Requests could not be loaded."); }
    finally { setLoadingRequests(false); }
  }, [profileId]);
  useEffect(() => { if (profileId) void loadRequests(); }, [profileId, loadRequests]);

  async function refresh() { setError(""); await loadRequests(); await onSaved(); router.refresh(); }
  async function submit() {
    if (busy) return;
    setError(""); setMessage("");
    if (!accepted) { setError("Accept the owner-only policy first."); return; }
    if (reviewedChange && (identity === initialIdentity || !name.trim() || reason.trim().length < 10 || !files.length)) {
      setError("Choose a different capacity, enter its legal owner/company name, provide a reason of at least 10 characters and attach supporting evidence."); return;
    }
    setBusy(true);
    const db = createClient();
    const uploaded: string[] = [];
    let submitted = false;
    try {
      if (reviewedChange) {
        const { data, error: authError } = await db.auth.getUser();
        if (authError || !data.user) throw new Error("Sign in again before submitting evidence.");
        const batch = crypto.randomUUID();
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const ext = file.type === "application/pdf" ? "pdf" : file.type === "image/png" ? "png" : "jpg";
          const path = `${data.user.id}/${batch}/${i}-${crypto.randomUUID()}.${ext}`;
          const { error } = await db.storage.from("declaration-documents").upload(path, file, { upsert: false, contentType: file.type });
          if (error) throw new Error(`Supporting document upload failed: ${error.message}`);
          uploaded.push(path);
        }
        const { error } = await db.rpc("submit_declaration_change", { p_identity: identity, p_legal_name: name.trim(), p_reason: reason.trim(), p_accept: true, p_evidence_paths: uploaded });
        if (error) throw new Error(error.message);
        submitted = true;
        setMessage("Change request submitted. Your approved category and account access remain unchanged while an admin reviews it.");
        setFiles([]); setAccepted(false); setReason("");
        await loadRequests();
      } else {
        const { error } = await db.rpc("declare_owner_identity", { p_identity: identity, p_accept: true });
        if (error) throw new Error(error.message);
        setMessage("Owner declaration recorded. Check Seller dashboard access above for any remaining identity or activation steps.");
      }
      await onSaved(); router.refresh();
    } catch (error) { const note = error instanceof Error ? error.message : "Declaration could not be saved."; if (reviewedChange && uploaded.length) await loadRequests(); setError(note); }
    finally {
      if (!submitted && uploaded.length) { try { await db.storage.from("declaration-documents").remove(uploaded); } catch { /* Referenced evidence stays protected if submission reached the server. */ } }
      setBusy(false);
    }
  }
  async function cancel() {
    if (!pending || busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const { error } = await createClient().rpc("cancel_declaration_change", { p_request_id: pending.id });
      if (error) throw new Error(error.message);
      setMessage("Request cancelled. Your approved declaration is unchanged.");
      await loadRequests();
    } catch (error) { setError(error instanceof Error ? error.message : "Cancellation failed."); }
    finally { setBusy(false); }
  }

  return <section className="space-y-4 rounded-xl border p-4">
    <h3 className="font-semibold">Owner-only listing declaration</h3>
    <p className="text-sm">All three are mandatory: one government ID, a matching selfie, and this declaration. Identity documents need admin approval before seller activation. Agents, brokers and marketing intermediaries cannot list. Each property requires separate ownership review.</p>
    {reviewedChange && <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm"><p>Effective saved capacity: <strong>{ownerKindLabel(initialIdentity)}</strong></p><p>After verification, changes require admin review. Your effective category stays unchanged while a request is pending. Approval reopens affected property ownership reviews; it does not reactivate suspended accounts or republish listings.</p></div>}
    {loadingRequests && <p className="text-sm">Loading request status…</p>}
    {pending ? <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm"><p className="break-words">Pending request: <strong>{ownerKindLabel(pending.requested_identity)}</strong> — {pending.requested_legal_name}</p><p className="whitespace-pre-wrap break-words">Reason: {pending.reason}</p><DeclarationChangeEvidence userId={pending.user_id} paths={pending.evidence_paths} /><button type="button" disabled={busy} onClick={() => void cancel()} className="rounded border px-3 py-2 disabled:opacity-40">Cancel pending request</button></div> : <fieldset disabled={busy || loadingRequests || loadFailed} className="min-w-0 space-y-3 disabled:opacity-60">
      <label className="block text-sm">{reviewedChange ? "Requested listing capacity" : "Listing capacity"}<select aria-label={reviewedChange ? "Requested listing capacity" : "Listing capacity"} className="mt-1 w-full rounded-lg border p-2" value={identity} onChange={event => { setIdentity(event.target.value); setAccepted(false); setName(event.target.value === "owner" ? personalName : ""); }}><option value="owner">I list properties I actually own</option><option value="project_owner_builder">My builder company owns the projects it lists</option></select></label>
      {reviewedChange && <><label className="block text-sm">Requested legal owner / owning company<input maxLength={200} value={name} onChange={event => setName(event.target.value)} className="mt-1 block w-full rounded-lg border p-2" /></label><label className="block text-sm">Reason for changing capacity<textarea minLength={10} maxLength={2000} value={reason} onChange={event => setReason(event.target.value)} className="mt-1 block w-full rounded-lg border p-2" /></label><label className="block text-sm">Supporting ownership/company evidence<input type="file" multiple accept="application/pdf,image/jpeg,image/png" onChange={event => { const chosen = Array.from(event.target.files || []); if (chosen.length > 5 || chosen.some(file => file.size > 10 * 1024 * 1024 || !["application/pdf", "image/jpeg", "image/png"].includes(file.type))) { setError("Choose 1–5 PDF, JPG or PNG files, each up to 10 MB."); setFiles([]); event.target.value = ""; return; } setError(""); setFiles(chosen); }} className="mt-1 block w-full" /></label><p className="text-xs text-slate-600">Attach private evidence supporting the personal or company ownership capacity you are requesting. A brochure or marketing authorization alone is insufficient. Evidence is retained with the review record.</p></>}
      <label className="flex gap-2 text-sm"><input type="checkbox" checked={accepted} onChange={event => setAccepted(event.target.checked)} />I accept the owner-only policy and will supply matching ownership evidence. I am not listing as an agent or broker.</label>
      <button type="button" className="btn-primary disabled:opacity-40" disabled={!accepted || busy || (reviewedChange && (identity === initialIdentity || !name.trim() || reason.trim().length < 10 || !files.length))} onClick={() => void submit()}>{busy ? "Saving…" : reviewedChange ? "Submit declaration change request" : "Save owner declaration"}</button>
    </fieldset>}
    {message && <p role="status" className="text-sm text-emerald-800">{message}</p>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {profileId && <button type="button" disabled={busy} className="text-sm underline" onClick={() => void refresh()}>Refresh declaration status</button>}
    {requests.filter(request => request.status !== "pending").map(request => <div key={request.id} className="rounded-lg border p-3 text-sm"><p>{ownerKindLabel(request.requested_identity)} — {request.status}</p>{request.review_note && <p className="whitespace-pre-wrap break-words">Review note: {request.review_note}</p>}</div>)}
  </section>;
}
