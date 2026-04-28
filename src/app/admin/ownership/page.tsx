"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { logAction } from "@/lib/moderation/logAction"

const supabase = createClient()

export default function OwnershipVerificationPage(){

  const [queue,setQueue] = useState<any[]>([])
  const [selected,setSelected] = useState<any>(null)
  const [fileUrl,setFileUrl] = useState<string | null>(null)

  const [loadingQueue,setLoadingQueue] = useState(true)
  const [loadingDoc,setLoadingDoc] = useState(false)
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
            ownership_verified,
            cities(name),
            localities(name)
          )
        `)
        .eq("document_type","ownership")
        .eq("status","pending")
        .eq("properties.status","pending")
        .eq("properties.ownership_verified",false)
        .neq("users.role", "admin")
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

  async function approve(doc:any){

    if(processing) return
    setProcessing(true)

    try{

      const { data } = await supabase.auth.getUser()
      const adminId = data.user?.id

      if(!adminId) throw new Error("Session expired")

      await supabase
        .from("documents")
        .update({
          status:"approved",
          reviewed_at:new Date().toISOString(),
          reviewed_by:adminId
        })
        .eq("id",doc.id)

      await supabase
        .from("properties")
        .update({
          ownership_verified:true,
          verification_status:"ownership_approved",
          status:"pending",
          rejection_reason:null
        })
        .eq("id", doc.property_id)

      await logAction(
        adminId,
        "property",
        doc.property_id,
        "approve_ownership",
        doc.document_subtype || "ownership"
      )

      setSelected(null)
      await fetchQueue()

    }catch(err:any){
      alert(err.message || "Approval failed")
    }

    setProcessing(false)
  }

  /* ================= REJECT ================= */

  async function reject(doc:any){

    const reason = prompt("Enter rejection reason")
    if(!reason) return

    if(processing) return
    setProcessing(true)

    try{

      const { data } = await supabase.auth.getUser()
      const adminId = data.user?.id

      if(!adminId) throw new Error("Session expired")

      await supabase
        .from("documents")
        .update({
          status:"rejected",
          rejection_reason:reason,
          reviewed_at:new Date().toISOString(),
          reviewed_by:adminId
        })
        .eq("id",doc.id)

      await supabase
        .from("properties")
        .update({
          status:"rejected",
          ownership_verified:false,
          verification_status:"ownership_rejected",
          rejection_reason:reason,
          approved_at:null
        })
        .eq("id", doc.property_id)

      await logAction(
        adminId,
        "property",
        doc.property_id,
        "reject_ownership",
        reason
      )

      setSelected(null)
      await fetchQueue()

    }catch(err:any){
      alert(err.message || "Reject failed")
    }

    setProcessing(false)
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

              <div className="flex gap-4">

                <button
                  disabled={processing}
                  onClick={()=>approve(selected)}
                  className="bg-green-600 text-white px-4 py-2 rounded"
                >
                  Approve Ownership
                </button>

                <button
                  disabled={processing}
                  onClick={()=>reject(selected)}
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