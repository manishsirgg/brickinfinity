"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
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
  const [processing, setProcessing] = useState(false)

  /* ================= FETCH QUEUE ================= */

  async function fetchQueue() {

    setLoadingQueue(true)

    const { data, error } = await supabase
      .from("properties")
      .select(`
        *,
        cities(name),
        localities(name),
        users:seller_id (
          id,
          full_name,
          email,
          phone,
          reputation_score
        )
      `)
      .eq("status","pending")
      .eq("ownership_verified", true)
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

  async function approve(property: any) {

    if (processing) return
    setProcessing(true)

    try {

      const { data: authData } = await supabase.auth.getUser()
      const adminId = authData.user?.id

      if (!adminId) throw new Error("Session expired")

      await supabase
        .from("properties")
        .update({
          status: "active",
          verification_status: "approved",
          rejection_reason: null,
          approved_at: new Date().toISOString()
        })
        .eq("id", property.id)

      await supabase
        .from("notifications")
        .insert({
          user_id: property.seller_id,
          title: "Property Approved",
          message: "Your property listing is now live.",
          type: "property"
        })

      await logAction(
        adminId,
        "property",
        property.id,
        "approve_property",
        "Property approved"
      )

      setSelected(null)
      setImages([])
      setVideos([])

      await fetchQueue()

    } catch (err: any) {

      console.error("Approve error >>>", err)
      alert(err.message || "Approval failed")

    }

    setProcessing(false)
  }

  /* ================= REJECT ================= */

  async function reject(property: any) {

    if (processing) return

    const reason = prompt("Enter rejection reason")
    if (!reason) return

    setProcessing(true)

    try {

      const { data: authData } = await supabase.auth.getUser()
      const adminId = authData.user?.id

      if (!adminId) throw new Error("Session expired")

      const { error } = await supabase
        .from("properties")
        .update({
          status: "rejected",
          verification_status: "listing_rejected",
          rejection_reason: reason
        })
        .eq("id", property.id)

      if (error) throw error

      await supabase
        .from("notifications")
        .insert({
          user_id: property.seller_id,
          title: "Property Rejected",
          message: reason,
          type: "property"
        })

      await logAction(
        adminId,
        "property",
        property.id,
        "reject_property",
        reason
      )

      setSelected(null)
      setImages([])
      setVideos([])

      await fetchQueue()

    } catch (err: any) {

      console.error("Reject error >>>", err)
      alert(err.message || "Reject failed")

    }

    setProcessing(false)
  }

  /* ================= UI ================= */

  return (

    <div className="max-w-7xl mx-auto p-10">

      <h1 className="text-2xl font-semibold mb-8">
        Property Listing Moderation
      </h1>

      <div className="grid grid-cols-3 gap-6">

        {/* QUEUE */}

        <div className="border rounded-xl p-4">

          <h2 className="font-semibold mb-4">
           Listings Awaiting Activation
          </h2>

          {loadingQueue && <p className="text-sm text-gray-500">Loading...</p>}

          {!loadingQueue && queue.length === 0 &&
            <p className="text-gray-500 text-sm">No listings awaiting activation</p>
          }

          <div className="space-y-2">

            {queue.map(item => (

              <div
                key={item.id}
                onClick={() => {
                  setImages([])
                  setVideos([])
                  setSelected(item)
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

              <div className="flex gap-4 flex-wrap">

                <button
                  disabled={processing}
                  onClick={()=>approve(selected)}
                  className="bg-green-600 text-white px-4 py-2 rounded"
                >
                  Activate
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