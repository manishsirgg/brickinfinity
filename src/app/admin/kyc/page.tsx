"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { logAction } from "@/lib/moderation/logAction"

const supabase = createClient()

export default function AdminKYCPage() {

  const [queue, setQueue] = useState<any[]>([])
  const [selected, setSelected] = useState<any>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)

  const [loadingDoc, setLoadingDoc] = useState(false)
  const [loadingQueue, setLoadingQueue] = useState(true)
  const [processing, setProcessing] = useState(false)

  /* ================= FETCH QUEUE ================= */

  async function fetchQueue() {

    setLoadingQueue(true)

    const { data, error } = await supabase
      .from("documents")
      .select(`
        id,
        user_id,
        document_type,
        document_url,
        status,
        created_at,
        users (
          id,
          full_name,
          email,
          phone,
          created_at,
          seller_status,
          reputation_score
        )
      `)
      .is("property_id", null)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(50)

    if (error) {
      console.error("Queue fetch error:", error)
      setLoadingQueue(false)
      return
    }

    setQueue(data || [])
    setLoadingQueue(false)
  }

  useEffect(() => {
    fetchQueue()
  }, [])

  /* ================= LOAD DOCUMENT ================= */

  async function loadDocument(path: string) {

    if (!path) return

    setLoadingDoc(true)
    setImageUrl(null)

    const { data, error } = await supabase
      .storage
      .from("identity-documents")
      .createSignedUrl(path, 3600)

    if (error) {
      console.error("Signed URL error:", error)
      setLoadingDoc(false)
      return
    }

    setImageUrl(data.signedUrl)
    setLoadingDoc(false)
  }

  useEffect(() => {

    if (!selected) {
      setImageUrl(null)
      return
    }

    loadDocument(selected.document_url)

  }, [selected])

  /* ================= APPROVE ================= */

  async function approve(doc: any) {

    const { data } = await supabase.auth.getUser()
    const adminId = data.user?.id

    if (!adminId) {
      alert("Session expired. Please login again.")
      return
    }

    setProcessing(true)

    /* ---- Approve this document ---- */

    const { error } = await supabase
      .from("documents")
      .update({
        status: "approved",
        reviewed_at: new Date(),
        reviewed_by: adminId
      })
      .eq("id", doc.id)

    if (error) {
      console.error("Approve error:", error)
      setProcessing(false)
      return
    }

    /* ---- STRICT KYC RULE CHECK ---- */

    const { data: allDocs } = await supabase
      .from("documents")
      .select("document_type, status")
      .eq("user_id", doc.user_id)

    const hasApprovedSelfie = allDocs?.some(
      (d: any) =>
        d.document_type === "selfie" &&
        d.status === "approved"
    )

    const hasApprovedGovtId = allDocs?.some(
      (d: any) =>
        (
          d.document_type === "aadhar" ||
          d.document_type === "passport" ||
          d.document_type === "driving_license"
        ) &&
        d.status === "approved"
    )

    if (hasApprovedSelfie && hasApprovedGovtId) {
      const requestedRole =
        doc?.users?.seller_status === "pending_admin"
          ? "admin"
          : "seller"

      await supabase
        .from("users")
        .update({
          kyc_status: "approved",
          role: requestedRole,
          seller_status: "active"
        })
        .eq("id", doc.user_id)

    }

    /* ---- LOG ---- */

    await logAction(
      adminId,
      "user",
      doc.user_id,
      "approve_kyc",
      `Approved ${doc.document_type}`
    )

    setSelected(null)
    setImageUrl(null)

    await fetchQueue()

    setProcessing(false)
  }

  /* ================= REJECT ================= */

  async function reject(doc: any) {

    const reason = prompt("Enter rejection reason")
    if (!reason) return

    const { data } = await supabase.auth.getUser()
    const adminId = data.user?.id

    if (!adminId) {
      alert("Session expired. Please login again.")
      return
    }

    setProcessing(true)

    const { error } = await supabase
      .from("documents")
      .update({
        status: "rejected",
        rejection_reason: reason,
        reviewed_at: new Date(),
        reviewed_by: adminId
      })
      .eq("id", doc.id)

    if (error) {
      console.error("Reject error:", error)
      setProcessing(false)
      return
    }

    const { error: userUpdateError } = await supabase
      .from("users")
      .update({
        kyc_status: "rejected",
        role: "buyer",
        seller_status: "basic"
      })
      .eq("id", doc.user_id)

    if (userUpdateError) {
      console.error("User KYC reject sync error:", userUpdateError)
      setProcessing(false)
      return
    }

    await logAction(
      adminId,
      "user",
      doc.user_id,
      "reject_kyc",
      reason
    )

    setSelected(null)
    setImageUrl(null)

    await fetchQueue()

    setProcessing(false)
  }

  /* ================= UI ================= */

  return (

    <div className="max-w-6xl mx-auto p-10">

      <h1 className="text-2xl font-semibold mb-8">
        KYC Verification
      </h1>

      <div className="grid grid-cols-3 gap-6">

        {/* QUEUE */}

        <div className="border rounded-xl p-4">

          <h2 className="font-semibold mb-4">
            Pending KYC
          </h2>

          {loadingQueue && (
            <p className="text-sm text-gray-500">
              Loading queue...
            </p>
          )}

          {!loadingQueue && queue.length === 0 && (
            <p className="text-sm text-gray-500">
              No pending KYC documents
            </p>
          )}

          <div className="space-y-2">

            {queue.map(item => (

              <div
                key={item.id}
                onClick={() => setSelected(item)}
                className={`border rounded-md p-3 cursor-pointer hover:bg-gray-100 ${
                  selected?.id === item.id ? "bg-gray-100" : ""
                }`}
              >

                <div className="font-medium">
                  {item.users?.full_name || "Unknown User"}
                </div>

                <div className="text-xs text-gray-500">
                  {item.users?.email}
                </div>

                <div className="text-xs text-gray-400">
                  Phone: {item.users?.phone || "N/A"}
                </div>

                <div className="text-xs text-gray-400 capitalize">
                  {item.document_type.replace("_", " ")}
                </div>

              </div>

            ))}

          </div>

        </div>

        {/* DOCUMENT VIEW */}

        <div className="col-span-2 border rounded-xl p-4">

          {!selected && (
            <p className="text-gray-500">
              Select a document to review
            </p>
          )}

          {selected && (

            <div>

              <div className="mb-4">

                <div className="font-medium">
                  {selected.users?.full_name}
                </div>

                <div className="text-sm text-gray-500">
                  {selected.users?.email}
                </div>

                <div className="text-sm text-gray-500">
                  Phone: {selected.users?.phone || "N/A"}
                </div>

                <div className="text-xs text-gray-400">
                  Joined: {new Date(selected.users?.created_at).toLocaleDateString()}
                </div>

                <div className="text-xs text-gray-400">
                  Seller Status: {selected.users?.seller_status}
                </div>

                <div className="text-xs text-gray-400 capitalize">
                  Document: {selected.document_type.replace("_", " ")}
                </div>

              </div>

              {loadingDoc && (
                <p className="text-gray-500 text-sm">
                  Loading document preview...
                </p>
              )}

              {imageUrl && (
                <img
                  src={imageUrl}
                  className="max-h-96 border rounded mb-4"
                />
              )}

              {!loadingDoc && !imageUrl && (
                <p className="text-red-500 text-sm mb-4">
                  Could not load document preview
                </p>
              )}

              <div className="flex gap-4">

                <button
                  disabled={processing}
                  onClick={() => approve(selected)}
                  className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:opacity-50"
                >
                  Approve
                </button>

                <button
                  disabled={processing}
                  onClick={() => reject(selected)}
                  className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 disabled:opacity-50"
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
