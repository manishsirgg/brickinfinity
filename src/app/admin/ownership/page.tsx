"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link";
import { useFormFeedback } from "@/lib/use-form-feedback";
import { isPendingOwnershipReview, pendingOwnershipQueue, ownershipDecisionConfirmed } from "@/lib/ownership-queue";
import ReviewCorrectionFields from "@/components/admin/ReviewCorrectionFields";
import ReviewEvidenceLinks from "@/components/admin/ReviewEvidenceLinks";
import { ownershipReviewBlockers, ownershipReviewError } from "@/lib/ownership-review";
import { createClient } from "@/lib/supabase/client"

const supabase = createClient()
const OWNERSHIP_SELECTION = `
 id,user_id,property_id,document_type,document_subtype,document_url,status,created_at,
 users!inner(id,role,full_name,email,phone),
 properties!inner(id,title,price,listing_type,status,deleted_at,ownership_verified,ownership_review_status,
 owner_kind,owner_legal_name,owner_project_name,owner_attested,cities(name),localities(name))
`;

export default function OwnershipVerificationPage(){

  const [queue,setQueue] = useState<any[]>([])
  const [selected,setSelected] = useState<any>(null)
  const [fileUrl,setFileUrl] = useState<string | null>(null)

  const [loadingQueue,setLoadingQueue] = useState(true)
  const [loadingDoc,setLoadingDoc] = useState(false)
  const [reviewChecks,setReviewChecks] = useState<Record<string,boolean>>({});
  const [reviewNote,setReviewNote] = useState("");
  const [correctionScope, setCorrectionScope] = useState("");
  const [requiredAction, setRequiredAction] = useState("");
  const { feedback, feedbackRef, showFeedback } = useFormFeedback();
  const [queueError, setQueueError] = useState("");
  const queueVersion = useRef(0);
  const invalidateQueueRequests = useCallback(() => { ++queueVersion.current; }, []);
  const reviewInFlight = useRef(false);
  useEffect(() => { setReviewChecks({}); setReviewNote(""); setCorrectionScope(""); setRequiredAction(""); }, [selected?.id]);
  const [processing,setProcessing] = useState(false)

  /* ================= FETCH QUEUE ================= */

  const fetchQueue = useCallback(async () => {
    const version = ++queueVersion.current;
    setLoadingQueue(true); setQueueError("");
    try {
      const { data, error } = await supabase.from("documents").select(OWNERSHIP_SELECTION)
        .eq("document_type", "ownership").eq("status", "pending")
        .eq("properties.status", "pending").eq("properties.ownership_verified", false)
        .eq("properties.ownership_review_status", "unreviewed").is("properties.deleted_at", null)
        .order("created_at", { ascending: false, nullsFirst: false }).order("id", { ascending: false }).limit(50);
      if (error) throw new Error(error.message);
      if (version !== queueVersion.current) return;
      const rows = pendingOwnershipQueue((data || []) as any[]);
      setQueue(rows);
      // An item reviewed/published elsewhere must also leave the detail panel.
      setSelected((previous: any) => previous ? rows.find(row => row.id === previous.id) || null : null);
    } catch (error) { if (version === queueVersion.current) setQueueError(error instanceof Error ? error.message : "Could not refresh ownership reviews."); }
    finally { if (version === queueVersion.current) setLoadingQueue(false); }
  }, []);

  useEffect(() => {
    void fetchQueue();
    const refresh = () => { if (!reviewInFlight.current && document.visibilityState === "visible") void fetchQueue(); };
    window.addEventListener("focus", refresh);
    window.addEventListener("pageshow", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      invalidateQueueRequests();
      window.removeEventListener("focus", refresh);
      window.removeEventListener("pageshow", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [fetchQueue, invalidateQueueRequests]);

  const selectedDocumentId = selected?.id;
  const selectedDocumentPath = selected?.document_url;
  useEffect(() => {
    let cancelled = false;
    setFileUrl(null); setLoadingDoc(Boolean(selectedDocumentPath));
    if (selectedDocumentPath) {
      void (async () => {
        try {
          const { data, error } = await supabase.storage.from("ownership-documents").createSignedUrl(selectedDocumentPath, 300);
          if (error || !data?.signedUrl) throw new Error("Preview unavailable");
          if (!cancelled) setFileUrl(data.signedUrl);
        } catch { if (!cancelled) showFeedback("The private document preview could not be loaded. Open the evidence links below or reload the page to retry."); }
        finally { if (!cancelled) setLoadingDoc(false); }
      })();
    }
    return () => { cancelled = true; };
  }, [selectedDocumentId, selectedDocumentPath, showFeedback]);

  /* ================= FILE TYPE DETECTOR ================= */

  function getFileType(path:string){

    const ext = path?.split(".").pop()?.toLowerCase()

    if(!ext) return "unknown"
    if(ext==="pdf") return "pdf"
    if(["jpg","jpeg","png","webp"].includes(ext)) return "image"

    return "unknown"
  }

  /* ================= APPROVE ================= */

  async function review(doc: any, approve: boolean) {
    if (reviewInFlight.current) return;
    if (!reviewNote.trim()) { showFeedback("Enter a review note or rejection reason before submitting."); return; }
    if (!approve && (!correctionScope || !requiredAction.trim())) { showFeedback("Choose the required corrections and explain what the seller must do."); return; }
    if (approve && approvalBlockers.length) { showFeedback(approvalBlockers.join(" ")); return; }
    showFeedback("");
    reviewInFlight.current = true; ++queueVersion.current; setProcessing(true);
    try {
      // Refresh the selected item before any decision, including when another
      // admin/tab has already published it while this page remained open.
      const { data: current, error: currentError } = await supabase.from("documents").select(OWNERSHIP_SELECTION).eq("id", doc.id).single();
      if (currentError || !current) throw new Error("Could not refresh this review. No new decision was sent. Refresh the pending queue and try again.");
      if (!isPendingOwnershipReview(current as any)) {
        setSelected(null); setQueue(previous => previous.filter(item => item.property_id !== doc.property_id));
        showFeedback("This property is no longer awaiting ownership review. The pending queue has been refreshed.", "success");
        await fetchQueue(); return;
      }
      const { error } = approve
        ? await supabase.rpc("review_property_ownership", { p_document_id: doc.id, p_approve: true, p_checks: reviewChecks, p_note: reviewNote.trim() })
        : await supabase.rpc("reject_property_review", { p_property_id: doc.property_id, p_stage: "ownership", p_document_id: doc.id, p_reason: reviewNote.trim(), p_scope: correctionScope, p_required_action: requiredAction.trim() });
      if (error) { showFeedback(ownershipReviewError(error)); return; }
      const { data: saved, error: savedError } = await supabase.from("documents").select(OWNERSHIP_SELECTION).eq("id", doc.id).single();
      if (savedError || !saved) throw new Error("The review request completed, but the saved decision could not be confirmed. Refresh the pending queue before retrying. Your note is retained.");
      if (!ownershipDecisionConfirmed(saved as any, approve)) throw new Error("The saved ownership decision does not match the requested decision. A resubmission or database trigger may have reset it. Refresh the queue and inspect the saved document/property status. Your note is retained.");
      setQueue(previous => previous.filter(item => item.property_id !== doc.property_id));
      setSelected(null); setFileUrl(null);
      showFeedback(approve ? "Ownership approved and removed from pending reviews. Publication is a separate step in Admin → Listings." : "Ownership rejected. The seller has been notified of the reason and required corrections and must explicitly resubmit after saving.", "success");
      await fetchQueue();
    } catch (error) { showFeedback(ownershipReviewError(error instanceof Error ? error : {})); }
    finally { reviewInFlight.current = false; setProcessing(false); setLoadingQueue(false); }
  }

  /* ================= UI ================= */

  const fileType =
    selected ? getFileType(selected.document_url) : null
  const approvalBlockers = ownershipReviewBlockers(selected?.properties || {}, reviewChecks, reviewNote);

  return(

    <div className="max-w-6xl mx-auto p-4 sm:p-10">

      <h1 className="text-2xl font-semibold mb-8">
        Property Ownership Verification
      </h1>

      <p className="mb-4 text-sm text-slate-600">Only properties awaiting ownership review appear here. Approved, rejected and published properties are excluded until a new ownership review is required. Supporting documents and past decisions remain in the ownership audit.</p>
      {feedback.text && <div ref={feedbackRef} tabIndex={-1} role={feedback.kind === "error" ? "alert" : "status"} className={`mb-4 rounded-lg border p-4 outline-none ${feedback.kind === "error" ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{feedback.text}{feedback.kind === "success" && <Link className="mt-2 block underline" href="/admin/properties">Open listing publication reviews</Link>}</div>}
      {queueError && <p role="alert" className="mb-4 rounded-lg border border-red-200 p-3 text-sm text-red-700">Could not refresh the queue; displayed data may be outdated. {queueError}</p>}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">

        {/* QUEUE */}

        <div className="border rounded-xl p-4">

          <h2 className="font-semibold mb-4">
            Pending Ownership Reviews
          </h2>

          {loadingQueue && <p>Loading...</p>}

          <button type="button" disabled={processing || loadingQueue} onClick={() => void fetchQueue()} className="mb-4 text-sm underline disabled:opacity-50">Refresh pending reviews</button>

          {!loadingQueue && !queueError && queue.length===0 &&
            <p className="text-sm text-gray-500">
              No pending documents
            </p>
          }

          <div className="space-y-2">

            {queue.map(item=>(

              <button type="button"
                key={item.id}
                disabled={processing || loadingQueue}
                onClick={()=>{setSelected(item);showFeedback("");}}
                className={`w-full border p-3 text-left rounded cursor-pointer hover:bg-gray-100 disabled:opacity-50 ${
                  selected?.id===item.id ? "bg-gray-100":""}`}
              >
                <div className="font-medium">
                  {item.users?.full_name}
                </div>

                <div className="text-xs text-gray-500">
                  {item.properties?.title}
                </div>

                <div className="text-xs text-gray-400 capitalize">
                  {item.document_subtype || item.document_type}
                </div>

              </button>

            ))}

          </div>

        </div>

        {/* REVIEW PANEL */}

        <div className="min-w-0 lg:col-span-2 border rounded-xl p-4">

          {!selected &&
            <p className="text-gray-500">
              Select document to review
            </p>
          }

          {selected && (

            <div>

              <div className="mb-4">
                <div className="font-medium">
                  Seller: {selected.users?.full_name}
                </div>

                <div className="text-sm text-gray-500">
                  {selected.users?.email}
                </div>
              </div>

              <div className="mb-4 border p-3 rounded bg-gray-50">

                <div className="font-medium">
                  {selected.properties?.title}
                </div>

                <div className="text-sm">
                  ₹{selected.properties?.price}
                </div>

                <div className="text-xs text-gray-500">
                  {selected.properties?.cities?.name}
                </div>

              </div>

              {loadingDoc &&
                <p className="text-sm text-gray-500">
                  Loading preview...
                </p>
              }

              {fileUrl && fileType==="pdf" && (
                <iframe
                  src={fileUrl}
                  title="Ownership evidence preview"
                  className="w-full h-[600px] border rounded mb-4"
                />
              )}

              {fileUrl && fileType==="image" && (
                <img
                  src={fileUrl}
                  alt="Ownership evidence"
                  className="max-h-[600px] border rounded mb-4"
                />
              )}

              {fileUrl && fileType==="unknown" && (
                <p className="text-red-500">
                  Unsupported file format
                </p>
              )}

              <ReviewEvidenceLinks key={selected.id} userId={selected.user_id} propertyId={selected.property_id} />
              <div className="mb-4 space-y-3 rounded-lg border p-4">
                <p>Legal owner: {selected.properties?.owner_legal_name || "Not provided — owner must update listing"}</p>
                <p>Category: {selected.properties?.owner_kind || "Not declared"} · Project: {selected.properties?.owner_project_name || "—"}</p>
                {Object.entries({ identity_matches:"The identity evidence matches the legal owner / owning company", property_matches:"The evidence identifies this exact property or project", owns_property:"The applicant / builder company actually owns the property", no_agent:"This is not an agent, broker, contractor or marketing-intermediary listing", ...(selected.properties?.owner_kind === "project_owner_builder" ? { company_owns_project:"Company and project ownership evidence reviewed" } : {}) }).map(([key,label]) => <label key={key} className="flex gap-2 text-sm"><input type="checkbox" checked={!!reviewChecks[key]} onChange={e=>setReviewChecks(prev=>({...prev,[key]:e.target.checked}))}/>{label}</label>)}
                <ReviewCorrectionFields scope={correctionScope} onScopeChange={setCorrectionScope} action={requiredAction} onActionChange={setRequiredAction} />
                <label className="block text-sm">Review note / rejection reason (required)<textarea required maxLength={2000} className="mt-1 w-full rounded border p-2" value={reviewNote} onChange={e=>setReviewNote(e.target.value)}/></label>
                <p className="text-sm text-slate-600">You can reject incomplete submissions. A reason, correction category and required seller action are mandatory.</p>
              </div>
              {approvalBlockers.length > 0 && <div id="ownership-approval-requirements" className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"><p className="font-semibold">Before you can approve ownership:</p><ul className="mt-2 list-disc space-y-1 pl-5">{approvalBlockers.map(reason=><li key={reason}>{reason}</li>)}</ul></div>}
              <div className="flex gap-4">

                <button
                  disabled={processing || loadingQueue || !isPendingOwnershipReview(selected) || approvalBlockers.length > 0}
                  aria-describedby={approvalBlockers.length ? "ownership-approval-requirements" : undefined}
                  onClick={()=>review(selected,true)}
                  className="bg-green-600 text-white px-4 py-2 rounded disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Approve Ownership
                </button>

                <button
                  disabled={processing || loadingQueue || !isPendingOwnershipReview(selected) || !reviewNote.trim()}
                  onClick={()=>review(selected,false)}
                  className="bg-red-600 text-white px-4 py-2 rounded disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Reject
                </button>

              </div>

            </div>

          )}

        </div>

      </div>

    </div>

  )
}
