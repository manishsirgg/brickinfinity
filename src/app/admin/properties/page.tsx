"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import ReviewCorrectionFields from "@/components/admin/ReviewCorrectionFields"
import { logAction } from "@/lib/moderation/logAction"

const supabase = createClient()

export default function AdminPropertiesPage() {

  const [queue, setQueue] = useState<any[]>([])
  const [selected, setSelected] = useState<any>(null)
  const [images, setImages] = useState<any[]>([])
  const [videos,setVideos] = useState<any[]>([])

  const [loadingQueue, setLoadingQueue] = useState(true)
  const [loadingImages, setLoadingImages] = useState(false)
  const [loadingVideos,setLoadingVideos] = useState(false)
  const [rejectionReason, setRejectionReason] = useState("")
  const [correctionScope, setCorrectionScope] = useState("")
  const [requiredAction, setRequiredAction] = useState("")
  useEffect(() => { setRejectionReason(""); setCorrectionScope(""); setRequiredAction("") }, [selected?.id])
  const [processing, setProcessing] = useState(false)
  const [publishError, setPublishError] = useState<string | null>(null)
  const [publishMessage, setPublishMessage] = useState<string | null>(null)

  /* ================= FETCH QUEUE ================= */

  async function fetchQueue() {

    setLoadingQueue(true)

    const { data, error } = await supabase
      .from("properties")
      .select(`
        *,
        cities(name),
        localities(name),
        users:seller_id!inner (
          id,
          role,
          full_name,
          email,
          phone,
          reputation_score
        )
      `)
      .eq("status", "pending")
      .or("and(ownership_verified.eq.true,verification_status.in.(ownership_approved,approved)),listing_source.eq.brickinfinity_admin")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })

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

  /* ================= LOAD IMAGES ================= */

  async function loadImages(propertyId: string) {

    setLoadingImages(true)

    const { data, error } = await supabase
      .from("property_images")
      .select("*")
      .eq("property_id", propertyId)
      .order("created_at", { ascending: true })

    if (error) {
      console.error("Images fetch error:", error)
      setLoadingImages(false)
      return
    }

    setImages(data || [])
    setLoadingImages(false)
  }

  /* ================= LOAD VIDEOS ================= */

  async function loadVideos(propertyId:string){

    setLoadingVideos(true)

    const { data, error } = await supabase
      .from("property_videos")
      .select("*")
      .eq("property_id", propertyId)
      .order("created_at", { ascending: true })

    if(error){
      console.error("Video fetch error:",error)
      setLoadingVideos(false)
      return
    }

    setVideos(data || [])
    setLoadingVideos(false)
  }

  useEffect(() => {
    if (!selected) return

    window.scrollTo({ top: 0, behavior: "smooth" })

    loadImages(selected.id)
    loadVideos(selected.id)

  }, [selected])

  /* ================= APPROVE ================= */

  async function publish(property: any) {

    if (processing) return
    setProcessing(true)
    setPublishError(null)
    setPublishMessage(null)

    try {

      const { data: authData, error: authError } = await supabase.auth.getUser()
      const adminId = authData.user?.id

      if (authError || !adminId) throw new Error("Session expired. Please sign in again.")

      const { data: publishedId, error: publishFailure } = await supabase.rpc(
        "admin_publish_property",
        { p_property_id: property.id }
      )

      if (publishFailure) {
        if (publishFailure.code === "PGRST202") {
          throw new Error("Publishing is not configured. Apply the admin publish database migration.")
        }
        throw new Error(publishFailure.message || "Property could not be published.")
      }
      if (publishedId !== property.id) {
        throw new Error("Publication was not confirmed. Refresh the queue and try again.")
      }

      // Publication is confirmed before attempting secondary notifications.
      try {
        const { error: notificationError } = await supabase
          .from("notifications")
          .insert({
            user_id: property.seller_id,
            title: "Property Published",
            message: "Your property listing is now live by admin action.",
            type: "property"
          })
        if (notificationError) throw notificationError

        await logAction(
          adminId,
          "property",
          property.id,
          "publish_property",
          "Property published by admin"
        )
        setPublishMessage("Property published successfully.")
      } catch (notificationError) {
        console.error("Post-publication notification error:", notificationError)
        setPublishMessage("Property published successfully, but the seller notification could not be sent.")
      }

      setSelected(null)
      setImages([])
      setVideos([])

      await fetchQueue()

    } catch (err: unknown) {

      console.error("Publish error >>>", err)
      setPublishError(err instanceof Error ? err.message : "Publish failed. Please try again.")

    } finally {
      setProcessing(false)
    }
  }

  /* ================= REJECT ================= */

  async function reject(property: any) {

    if (processing) return

    if (!rejectionReason.trim() || !correctionScope || !requiredAction.trim()) {
      setPublishError("Enter a rejection reason, choose the required corrections and explain what the seller must do.")
      return
    }
    setProcessing(true); setPublishError(null); setPublishMessage(null)
    try {
      const { data, error } = await supabase.rpc("reject_property_review", {
        p_property_id: property.id, p_stage: "listing", p_reason: rejectionReason.trim(),
        p_scope: correctionScope, p_required_action: requiredAction.trim()
      })
      if (error || !data) throw new Error(error?.message || "Rejection was not confirmed.")
      setPublishMessage("Listing rejected. The seller was notified of the reason and required corrections.")
      setSelected(null)
      setImages([])
      setVideos([])

      await fetchQueue()

    } catch (err: any) {

      console.error("Reject error >>>", err)
      setPublishError(err.message || "Reject failed")

    }

    setProcessing(false)
  }

  /* ================= UI ================= */

  return (

    <div className="max-w-7xl mx-auto p-10">

      <h1 className="text-2xl font-semibold mb-8">
        Property Listing Control
      </h1>

      {publishError && <p role="alert" className="mb-4 text-red-700">{publishError}</p>}
      {publishMessage && <p role="status" className="mb-4 text-green-700">{publishMessage}</p>}

      <div className="mb-6">
        <Link
          href="/dashboard/add-property"
          className="inline-flex items-center rounded bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-black"
        >
          + Create Property (Admin Direct)
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-6">

        {/* QUEUE */}

        <div className="border rounded-xl p-4">

          <h2 className="font-semibold mb-4">
           Pending Listing Review
          </h2>

          {loadingQueue && <p className="text-sm text-gray-500">Loading...</p>}

          {!loadingQueue && queue.length === 0 &&
            <p className="text-gray-500 text-sm">No listings found</p>
          }

          <div className="space-y-2">

            {queue.map(item => (

              <div
                key={item.id}
                onClick={() => {
                  setImages([])
                  setVideos([])
                  setSelected(item)
                  setPublishError(null)
                  setPublishMessage(null)
                }}
                className={`border rounded-md p-3 cursor-pointer hover:bg-gray-100 ${
                  selected?.id === item.id ? "bg-gray-100" : ""
                }`}
              >
                <div className="font-medium">{item.title}</div>
                <div className="text-xs text-gray-500">
                  Seller: {item.users?.full_name}
                </div>
                <div className="text-xs text-gray-500">
                  ₹{item.price}
                </div>
                <div className="mt-1 text-[11px] uppercase font-semibold text-gray-600">
                  Status: {item.status}
                </div>
              </div>

            ))}

          </div>

        </div>

        {/* REVIEW PANEL */}

        <div className="col-span-2 border rounded-xl p-4">

          {!selected &&
            <p className="text-gray-500">Select a property to review</p>
          }

          {selected && (

            <div>

              <div className="mb-4 space-y-1">
                <div className="text-lg font-semibold">{selected.title}</div>
                <div className="text-sm text-gray-500">
                  Seller: {selected.users?.full_name}
                </div>
                <div className="text-sm text-gray-500">
                  Phone: {selected.users?.phone}
                </div>
                <div className="text-sm text-gray-500">
                  Price: ₹{selected.price}
                </div>
                <div className="text-sm text-gray-500">
                  {selected.property_type} • {selected.listing_type}
                </div>
                <div className="text-sm text-gray-500">
                  City: {selected.cities?.name}
                </div>
                <div className="text-sm text-gray-500">
                  Locality: {selected.localities?.name}
                </div>
                <div className="text-sm font-semibold text-gray-700">
                  Listing Status: {selected.status}
                </div>
              </div>

              <div className="mb-6 text-sm text-gray-700">
                {selected.description}
              </div>

              <div className="grid grid-cols-3 gap-4 mb-6">

                {loadingImages && <p className="text-sm text-gray-500">Loading...</p>}

                {!loadingImages && images.length === 0 &&
                  <p className="text-sm text-gray-500">No images</p>
                }

                {images.map(img => (
                  <img key={img.id} src={img.image_url} className="rounded border"/>
                ))}

              </div>

              {/* VIDEO */}

              <div className="mb-6">

                <h3 className="font-semibold mb-2">Property Video</h3>

                {loadingVideos && (
                  <p className="text-sm text-gray-500">Loading video...</p>
                )}

                {!loadingVideos && videos.length === 0 && (
                  <p className="text-sm text-gray-500">No video uploaded</p>
                )}

                {videos.map(v => (
                  <video
                    key={v.id}
                    src={v.video_url}
                    controls
                    className="w-full max-h-[400px] rounded border"
                  />
                ))}

              </div>

              <div className="space-y-3">
                <label className="block text-sm">Rejection reason (required when rejecting)
                  <textarea value={rejectionReason} maxLength={2000} onChange={event => setRejectionReason(event.target.value)} className="mt-1 w-full rounded border p-2" />
                </label>
                <ReviewCorrectionFields scope={correctionScope} onScopeChange={setCorrectionScope} action={requiredAction} onActionChange={setRequiredAction} />
              </div>
              <div className="flex gap-4 flex-wrap">
                <Link
                  href={`/dashboard/edit/${selected.id}`}
                  className="bg-gray-800 text-white px-4 py-2 rounded"
                >
                  Edit
                </Link>

                <button
                  disabled={processing}
                  onClick={()=>publish(selected)}
                  className="bg-green-600 text-white px-4 py-2 rounded"
                >
                  {processing ? "Processing..." : "Publish Now"}
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
