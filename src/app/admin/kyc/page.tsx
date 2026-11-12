"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import IdentityDocumentPreview from "@/components/admin/IdentityDocumentPreview";
import { IDENTITY_TYPES, identityApplicationSnapshot, identityCapacityLabel, identityLabel, latestIdentityDocuments, type IdentityApplication, type IdentityDocument } from "@/lib/identity-review";

const supabase = createClient();
const documentSelection = `id,user_id,document_type,document_url,status,created_at,rejection_reason,users(id,full_name,email,phone,owner_declaration_at,seller_identity,kyc_status,seller_status)`;

export default function AdminKYCPage() {
  const [queue, setQueue] = useState<IdentityApplication[]>([]);
  const [selected, setSelected] = useState<IdentityApplication | null>(null);
  const [documents, setDocuments] = useState<IdentityDocument[]>([]);
  const [loadingQueue, setLoadingQueue] = useState(true);
  const [loadingDocuments, setLoadingDocuments] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [reviewNote, setReviewNote] = useState("");
  const [requiredAction, setRequiredAction] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const selectionVersion = useRef(0);

  async function fetchQueue() {
    setLoadingQueue(true);
    try {
      const { data, error } = await supabase.rpc("get_pending_identity_applications");
      if (error) throw new Error(error.message);
      setQueue((data || []) as IdentityApplication[]);
    } catch (error) { setError(error instanceof Error ? error.message : "KYC queue could not be loaded."); }
    finally { setLoadingQueue(false); }
  }

  useEffect(() => { void fetchQueue(); }, []);

  async function loadApplication(application: IdentityApplication, resetNote = true) {
    const version = ++selectionVersion.current;
    setSelected(application); setLoadingDocuments(true); setDocuments([]); setError("");
    if (resetNote) { setReviewNote(""); setRequiredAction(""); setMessage(""); setError(""); }
    try {
      const { data, error } = await supabase.from("documents").select(documentSelection).eq("user_id", application.user_id)
        .is("property_id", null).in("document_type", [...IDENTITY_TYPES]).order("created_at", { ascending: false, nullsFirst: false }).order("id", { ascending: false });
      if (error) throw new Error(error.message);
      if (version !== selectionVersion.current) return;
      const latest = latestIdentityDocuments((data || []) as unknown as IdentityDocument[]);
      setDocuments(latest);
      if (latest[0]?.users) setSelected({ ...application, profile: latest[0].users });
    } catch (error) { if (version === selectionVersion.current) setError(error instanceof Error ? error.message : "Identity documents could not be loaded."); }
    finally { if (version === selectionVersion.current) setLoadingDocuments(false); }
  }

  async function reviewApplication(approve: boolean) {
    if (processing || loadingDocuments || !selected) return;
    const note = reviewNote.trim();
    if (!note) { setError("Enter the application review note or rejection reason."); return; }
    if (!approve && !requiredAction.trim()) { setError("Explain what the applicant must correct before resubmitting."); return; }
    setProcessing(true); setError(""); setMessage("");
    try {
      const { data, error } = await supabase.rpc("review_identity_application", {
        p_user_id: selected.user_id, p_approve: approve, p_note: note,
        p_expected_application: identityApplicationSnapshot(selected.profile, documents),
        p_required_action: approve ? null : requiredAction.trim(),
      });
      if (error) throw new Error(error.message);
      if (data?.approved !== approve || data?.seller_active !== approve) throw new Error("The complete application decision was not confirmed. Refresh before retrying.");
      ++selectionVersion.current;
      setSelected(null); setDocuments([]); setReviewNote(""); setRequiredAction("");
      setMessage(approve ? "Application approved. Government ID, selfie and owner/builder declaration were reviewed together; seller access is now active. Property ownership approval remains separate." : "Application rejected. The applicant was notified of the reason and required corrections. A corrected upload will return this user's application to the KYC queue.");
      await fetchQueue();
    } catch (error) { setError(error instanceof Error ? error.message : "Application review failed. Your note has been kept."); }
    finally { setProcessing(false); }
  }

  const hasId = documents.some(doc => doc.document_type !== "selfie");
  const hasSelfie = documents.some(doc => doc.document_type === "selfie");
  const declared = Boolean(selected?.profile?.owner_declaration_at) && ["owner", "project_owner_builder"].includes(selected?.profile?.seller_identity || "");
  const pending = documents.some(doc => doc.status === "pending");
  return <main className="mx-auto max-w-7xl p-4 sm:p-8">
    <h1 className="mb-3 text-2xl font-semibold">KYC Verification</h1>
    <p className="mb-6 text-sm text-slate-600">One consolidated application per user. Review all current government IDs, the matching selfie and owner/builder declaration together, then approve or reject the complete application.</p>
    <div className="grid min-w-0 gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="min-w-0 rounded-xl border p-4">
        <h2 className="mb-4 font-semibold">Pending KYC applications</h2>
        {loadingQueue && <p>Loading applications…</p>}
        {!loadingQueue && !queue.length && <p className="text-sm text-slate-600">No pending KYC applications</p>}
        <div className="space-y-2">{queue.map(application => <button type="button" key={application.user_id} disabled={processing} onClick={() => void loadApplication(application, selected?.user_id !== application.user_id)} className={`w-full rounded-lg border p-3 text-left disabled:opacity-50 ${selected?.user_id === application.user_id ? "bg-slate-100" : "hover:bg-slate-50"}`}>
          <span className="block font-medium">{application.profile?.full_name || "Unknown user"}</span>
          <span className="block break-all text-xs text-slate-600">{application.profile?.email}</span>
          <span className="block text-xs">{application.documents.length} evidence file(s) · One application awaiting decision</span>
        </button>)}</div>
        <button type="button" disabled={processing} onClick={() => void fetchQueue()} className="mt-4 text-sm underline">Refresh applications</button>
      </aside>
      <section className="min-w-0 space-y-4 rounded-xl border p-4">
        {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        {processing && <p role="status" className="text-sm text-slate-600">Saving application decision…</p>}
        {message && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
        {!selected ? <p>Select a user application to review</p> : <>
          <h2 className="text-lg font-semibold">{selected.profile?.full_name || "User"} — Identity review</h2>
          <p className="break-all text-sm">{selected.profile?.email} · {selected.profile?.phone || "Phone not provided"}</p>
          <p className="text-sm">Owner-only declaration: <strong>{selected.profile?.owner_declaration_at ? "Recorded" : "Not saved — required before seller activation"}</strong></p>
          <p className="text-sm">Listing capacity: <strong>{identityCapacityLabel(selected.profile?.seller_identity)}</strong></p>
          <p className="text-sm">Identity status: {selected.profile?.kyc_status || "Not submitted"} · Seller status: {selected.profile?.seller_status || "Not active"}</p>
          {loadingDocuments ? <p>Loading this user’s identity evidence…</p> : <>
            {(!hasId || !hasSelfie) && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{!hasId && "Government ID is missing. "}{!hasSelfie && "Selfie is missing. "}The application cannot be approved until both are present.</p>}
            <label className="block text-sm font-medium">Application review note / rejection reason (required)
              <textarea maxLength={2000} value={reviewNote} disabled={processing} onChange={event => setReviewNote(event.target.value)} rows={3} placeholder="Record your identity comparison findings or explain the rejection." className="mt-2 w-full rounded-lg border px-3 py-2 font-normal" />
            </label>
            <label className="block text-sm font-medium">Required applicant corrections (required when rejecting)
              <textarea value={requiredAction} maxLength={2000} disabled={processing} onChange={event => setRequiredAction(event.target.value)} rows={3} placeholder="Specify which ID/selfie or declaration needs correction and what the applicant must upload or update." className="mt-2 w-full rounded-lg border px-3 py-2 font-normal" />
            </label>
            <div className="grid min-w-0 gap-4 xl:grid-cols-2">{documents.map(document => <article key={document.id} className="min-w-0 space-y-3 rounded-lg border p-3">
              <h3 className="font-semibold">{identityLabel(document.document_type)}</h3>
              <p className="text-sm">Document status: {document.status}</p>
              {document.rejection_reason && <p className="text-sm text-red-700">Rejection reason: {document.rejection_reason}</p>}
              <IdentityDocumentPreview document={document} />
            </article>)}</div>
            {!documents.length && <p>No current identity documents found. Refresh the application queue.</p>}
            <p className="text-sm text-slate-600">Approving confirms that the government ID and selfie match and the applicant has accepted the actual-owner/project-owning-builder declaration. Agents and brokers are not eligible.</p>
            {!declared && <p className="text-sm text-amber-900">A valid owner or project-owning-builder declaration is required before application approval.</p>}
            <div className="flex flex-wrap gap-3">
              <button type="button" disabled={processing || !pending || !hasId || !hasSelfie || !declared || !reviewNote.trim()} onClick={() => void reviewApplication(true)} className="rounded bg-green-700 px-4 py-3 text-white disabled:cursor-not-allowed disabled:opacity-40">Approve application</button>
              <button type="button" disabled={processing || !pending || !reviewNote.trim() || !requiredAction.trim()} onClick={() => void reviewApplication(false)} className="rounded bg-red-700 px-4 py-3 text-white disabled:cursor-not-allowed disabled:opacity-40">Reject and request resubmission</button>
              <button type="button" disabled={processing} onClick={() => void loadApplication(selected, false)} className="rounded border px-4 py-3 text-sm disabled:opacity-40">Reload current evidence</button>
            </div>
          </>}
        </>}
      </section>
    </div>
  </main>;
}
