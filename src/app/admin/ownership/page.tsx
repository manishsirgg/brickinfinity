"use client"

import { useEffect, useState } from "react"
import ReviewEvidenceLinks from "@/components/admin/ReviewEvidenceLinks";
import { validateOwnerFields } from "@/lib/owner-verification";
import { createClient } from "@/lib/supabase/client"

const supabase = createClient()

export default function OwnershipVerificationPage(){

  const [queue,setQueue] = useState<any[]>([])
  const [selected,setSelected] = useState<any>(null)
  const [fileUrl,setFileUrl] = useState<string | null>(null)

  const [loadingQueue,setLoadingQueue] = useState(true)
  const [loadingDoc,setLoadingDoc] = useState(false)
  const [reviewChecks,setReviewChecks] = useState<Record<string,boolean>>({});
  const [reviewNote,setReviewNote] = useState("");
  useEffect(() => { setReviewChecks({}); setReviewNote(""); }, [selected?.id]);
  const [processing,setProcessing] = useState(false)

  /* ================= FETCH QUEUE ================= */

  async function fetchQueue(){

    setLoadingQueue(true)

    const { data,error } =
      await supabase
        .from("documents")
        .select(`
          id,
          user_id,
          property_id,
          document_type,
          document_subtype,
          document_url,
          status,
          created_at,
          users!inner (
            id,
            role,
            full_name,
            email,
            phone
          ),
          properties!inner (
            id,
            title,
            price,
            listing_type,
            status,
            ownership_verified,owner_kind,owner_legal_name,owner_project_name,owner_attested,
            cities(name),
            localities(name)
          )
        `)
        .eq("document_type","ownership")
        .eq("status","pending")
        .eq("properties.status","pending")
        .eq("properties.ownership_verified",false)
          .order("created_at",{ascending:false})
        .limit(50)

    if(error){
      console.error("Ownership queue error:", error)
    }

    setQueue(data || [])
    setLoadingQueue(false)
  }

  useEffect(()=>{
    fetchQueue()
  },[])

  /* ================= LOAD SIGNED URL ================= */

  async function loadDocument(path:string){

    if(!path) return

    setLoadingDoc(true)
    setFileUrl(null)

    const { data,error } =
      await supabase
        .storage
        .from("ownership-documents")
        .createSignedUrl(path,3600)

    if(error){
      console.error("Signed URL error:", error)
      setLoadingDoc(false)
      return
    }

    setFileUrl(data.signedUrl)
    setLoadingDoc(false)
  }

  useEffect(()=>{
    if(selected){
      loadDocument(selected.document_url)
    }else{
      setFileUrl(null)
    }
  },[selected])

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
    if (processing) return;
    if (!reviewNote.trim()) { alert("Record a review note or rejection reason."); return; }
    setProcessing(true);
    try {
      const { error } = await supabase.rpc("review_property_ownership", { p_document_id: doc.id, p_approve: approve, p_checks: reviewChecks, p_note: reviewNote.trim() });
      if (error) throw new Error(error.message);
      setSelected(null); await fetchQueue();
    } catch (error) { alert(error instanceof Error ? error.message : "Ownership review failed"); }
    finally { setProcessing(false); }
  }

  /* ================= UI ================= */

  const fileType =
    selected ? getFileType(selected.document_url) : null

  return(

    <div className="max-w-6xl mx-auto p-10">

      <h1 className="text-2xl font-semibold mb-8">
        Property Ownership Verification
      </h1>

      <div className="grid grid-cols-3 gap-6">

        {/* QUEUE */}

        <div className="border rounded-xl p-4">

          <h2 className="font-semibold mb-4">
            Pending Ownership Documents
          </h2>

          {loadingQueue && <p>Loading...</p>}

          {!loadingQueue && queue.length===0 &&
            <p className="text-sm text-gray-500">
              No pending documents
            </p>
          }

          <div className="space-y-2">

            {queue.map(item=>(

              <div
                key={item.id}
                onClick={()=>setSelected(item)}
                className={`border p-3 rounded cursor-pointer hover:bg-gray-100 ${
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

              </div>

            ))}

          </div>

        </div>

        {/* REVIEW PANEL */}

        <div className="col-span-2 border rounded-xl p-4">

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
                  className="w-full h-[600px] border rounded mb-4"
                />
              )}

              {fileUrl && fileType==="image" && (
                <img
                  src={fileUrl}
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
                <label className="block text-sm">Review note / rejection reason<textarea className="mt-1 w-full rounded border p-2" value={reviewNote} onChange={e=>setReviewNote(e.target.value)}/></label>
              </div>
              <div className="flex gap-4">

                <button
                  disabled={processing || Boolean(validateOwnerFields(selected.properties || {})) || !reviewNote.trim() || !["identity_matches","property_matches","owns_property","no_agent",...(selected.properties?.owner_kind === "project_owner_builder" ? ["company_owns_project"] : [])].every(key => reviewChecks[key])}
                  onClick={()=>review(selected,true)}
                  className="bg-green-600 text-white px-4 py-2 rounded"
                >
                  Approve Ownership
                </button>

                <button
                  disabled={processing}
                  onClick={()=>review(selected,false)}
                  className="bg-red-600 text-white px-4 py-2 rounded"
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