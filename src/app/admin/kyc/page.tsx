"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"

const supabase = createClient()

export default function AdminKYCPage() {

  const [queue, setQueue] = useState<any[]>([])
  const [selected, setSelected] = useState<any>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)

  const [loadingDoc, setLoadingDoc] = useState(false)
  const [loadingQueue, setLoadingQueue] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [rejectReason, setRejectReason] = useState("")

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

  function getRequestedRole(_sellerStatus?: string): string { return "seller"; }

  /* ================= APPROVE ================= */

  async function reviewIdentity(doc: any, approve: boolean) {
    if (processing) return;
    const note = approve ? prompt("Record the identity / selfie matching review note") : rejectReason.trim();
    if (!note?.trim()) { alert("A review note or rejection reason is required."); return; }
    setProcessing(true);
    try {
      const { error } = await supabase.rpc("review_identity_document", { p_document_id: doc.id, p_approve: approve, p_note: note.trim() });
      if (error) throw new Error(error.message);
      setSelected(null); setImageUrl(null); setRejectReason(""); await fetchQueue();
    } catch (error) { alert(error instanceof Error ? error.message : "Identity review failed"); }
    finally { setProcessing(false); }
  }
  const approve = (doc: any) => reviewIdentity(doc,true);
  const reject = (doc: any) => reviewIdentity(doc,false);

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

                <div className="mt-2">
                  <span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${
                    getRequestedRole(item.users?.seller_status) === "admin"
                      ? "bg-red-100 text-red-700"
                      : "bg-blue-100 text-blue-700"
                  }`}>
                    {getRequestedRole(item.users?.seller_status) === "admin"
                      ? "Applying for Admin"
                      : "Applying for Seller"}
                  </span>
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

                <div className="mt-3">
                  <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${
                    getRequestedRole(selected.users?.seller_status) === "admin"
                      ? "bg-red-100 text-red-700 ring-2 ring-red-300"
                      : "bg-blue-100 text-blue-700 ring-2 ring-blue-200"
                  }`}>
                    Requested role: {getRequestedRole(selected.users?.seller_status)}
                  </span>
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

              <div className="mt-4 mb-4">
                <label className="block text-sm font-medium mb-1">
                  Rejection reason (required if rejecting)
                </label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  rows={3}
                  placeholder="Explain why this document/application is being rejected."
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>

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
