"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import IdentityDocumentPreview from "@/components/admin/IdentityDocumentPreview";
import { groupIdentityApplications, IDENTITY_TYPES, identityLabel, latestIdentityDocuments, type IdentityApplication, type IdentityDocument } from "@/lib/identity-review";

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
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const selectionVersion = useRef(0);

  async function fetchQueue() {
    setLoadingQueue(true);
    try {
      // Page by users, not documents, so each applicant has one queue entry.
      const { data, error } = await supabase.from("users").select(`id,full_name,email,phone,owner_declaration_at,seller_identity,kyc_status,seller_status,documents!inner(id,user_id,document_type,document_url,status,created_at,rejection_reason)`)
        .is("documents.property_id", null).in("documents.document_type", [...IDENTITY_TYPES]).eq("documents.status", "pending").order("id").limit(50);
      if (error) throw new Error(error.message);
      const rows = (data || []).flatMap(user => user.documents.map(doc => ({ ...doc, users: { id: user.id, full_name: user.full_name, email: user.email, phone: user.phone, owner_declaration_at: user.owner_declaration_at, seller_identity: user.seller_identity, kyc_status: user.kyc_status, seller_status: user.seller_status } })));
      setQueue(groupIdentityApplications(rows));
    } catch (error) { setError(error instanceof Error ? error.message : "KYC queue could not be loaded."); }
    finally { setLoadingQueue(false); }
  }

  useEffect(() => { void fetchQueue(); }, []);

  async function loadApplication(application: IdentityApplication, resetNote = true) {
    const version = ++selectionVersion.current;
    setSelected(application); setLoadingDocuments(true); setDocuments([]);
    if (resetNote) { setReviewNote(""); setMessage(""); setError(""); }
    try {
      const { data, error } = await supabase.from("documents").select(documentSelection).eq("user_id", application.user_id)
        .is("property_id", null).in("document_type", [...IDENTITY_TYPES]).order("created_at", { ascending: false }).order("id", { ascending: false });
      if (error) throw new Error(error.message);
      if (version !== selectionVersion.current) return;
      const latest = latestIdentityDocuments((data || []) as unknown as IdentityDocument[]);
      setDocuments(latest);
      if (latest[0]?.users) setSelected({ ...application, profile: latest[0].users });
    } catch (error) { if (version === selectionVersion.current) setError(error instanceof Error ? error.message : "Identity documents could not be loaded."); }
    finally { if (version === selectionVersion.current) setLoadingDocuments(false); }
  }

  async function reviewDocument(document: IdentityDocument, approve: boolean) {
    if (processing || !selected) return;
    const note = reviewNote.trim();
    if (!note) { setError("Enter the review note or rejection reason in the box below."); return; }
    setProcessing(true); setError(""); setMessage("");
    try {
      const { error } = await supabase.rpc("review_identity_document", { p_document_id: document.id, p_approve: approve, p_note: note });
      if (error) throw new Error(error.message);
      setMessage(`${identityLabel(document.document_type)} ${approve ? "approved" : "rejected"}. Review any remaining pending documents for this user. Your note has been kept.`);
      await loadApplication(selected, false);
      await fetchQueue();
    } catch (error) { setError(error instanceof Error ? error.message : "Identity review failed. Your note has been kept."); }
    finally { setProcessing(false); }
  }

  const hasId = documents.some(doc => doc.document_type !== "selfie");
  const hasSelfie = documents.some(doc => doc.document_type === "selfie");
  return <main className="mx-auto max-w-7xl p-4 sm:p-8">
    <h1 className="mb-3 text-2xl font-semibold">KYC Verification</h1>
    <p className="mb-6 text-sm text-slate-600">One application per user. Compare their government ID and selfie together. Seller access requires both identity documents to be approved and the owner-only declaration to be saved.</p>
    <div className="grid min-w-0 gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="min-w-0 rounded-xl border p-4">
        <h2 className="mb-4 font-semibold">Pending KYC applications</h2>
        {loadingQueue && <p>Loading applications…</p>}
        {!loadingQueue && !queue.length && <p className="text-sm text-slate-600">No pending KYC applications</p>}
        <div className="space-y-2">{queue.map(application => <button type="button" key={application.user_id} disabled={processing} onClick={() => void loadApplication(application, selected?.user_id !== application.user_id)} className={`w-full rounded-lg border p-3 text-left disabled:opacity-50 ${selected?.user_id === application.user_id ? "bg-slate-100" : "hover:bg-slate-50"}`}>
          <span className="block font-medium">{application.profile?.full_name || "Unknown user"}</span>
          <span className="block break-all text-xs text-slate-600">{application.profile?.email}</span>
          <span className="block text-xs">{application.documents.filter(doc => doc.status === "pending").length} pending document(s) · One user application</span>
        </button>)}</div>
        <button type="button" disabled={processing} onClick={() => void fetchQueue()} className="mt-4 text-sm underline">Refresh applications</button>
      </aside>
      <section className="min-w-0 space-y-4 rounded-xl border p-4">
        {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        {processing && <p role="status" className="text-sm text-slate-600">Saving document decision…</p>}
        {message && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
        {!selected ? <p>Select a user application to review</p> : <>
          <h2 className="text-lg font-semibold">{selected.profile?.full_name || "User"} — Identity review</h2>
          <p className="break-all text-sm">{selected.profile?.email} · {selected.profile?.phone || "Phone not provided"}</p>
          <p className="text-sm">Owner-only declaration: <strong>{selected.profile?.owner_declaration_at ? "Recorded" : "Not saved — required before seller activation"}</strong></p>
          <p className="text-sm">Identity status: {selected.profile?.kyc_status || "Not submitted"} · Seller status: {selected.profile?.seller_status || "Not active"}</p>
          {loadingDocuments ? <p>Loading this user’s identity evidence…</p> : <>
            {(!hasId || !hasSelfie) && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{!hasId && "Government ID is missing. "}{!hasSelfie && "Selfie is missing. "}Approving one document alone does not complete identity verification.</p>}
            <label className="block text-sm font-medium">Review note / rejection reason (required for either decision)
              <textarea value={reviewNote} disabled={processing} onChange={event => setReviewNote(event.target.value)} rows={3} placeholder="Record your identity comparison findings or explain the rejection." className="mt-2 w-full rounded-lg border px-3 py-2 font-normal" />
            </label>
            <p className="text-xs text-slate-600">This note is sent with the document decision. No additional popup note is required. It stays here while you review this user’s other documents.</p>
            <div className="grid min-w-0 gap-4 xl:grid-cols-2">{documents.map(document => <article key={document.id} className="min-w-0 space-y-3 rounded-lg border p-3">
              <h3 className="font-semibold">{identityLabel(document.document_type)}</h3>
              <p className="text-sm">Document status: {document.status}</p>
              {document.rejection_reason && <p className="text-sm text-red-700">Rejection reason: {document.rejection_reason}</p>}
              <IdentityDocumentPreview document={document} />
              {document.status === "pending" && <div className="flex flex-wrap gap-2">
                <button type="button" disabled={processing || !reviewNote.trim()} onClick={() => void reviewDocument(document, true)} className="rounded bg-green-700 px-3 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-40">Approve {identityLabel(document.document_type)}</button>
                <button type="button" disabled={processing || !reviewNote.trim()} onClick={() => void reviewDocument(document, false)} className="rounded bg-red-700 px-3 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-40">Reject {identityLabel(document.document_type)}</button>
              </div>}
            </article>)}</div>
            {!documents.length && <p>No current identity documents found. Refresh the application queue.</p>}
          </>}
        </>}
      </section>
    </div>
  </main>;
}
