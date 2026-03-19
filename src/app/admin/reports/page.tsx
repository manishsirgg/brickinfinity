"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { logAction } from "@/lib/moderation/logAction"

const supabase = createClient()

export default function AdminReportsPage() {

  const [reports, setReports] = useState<any[]>([])
  const [selected, setSelected] = useState<any>(null)
  const [images, setImages] = useState<any[]>([])

  const [loadingImages, setLoadingImages] = useState(false)
  const [loadingReports, setLoadingReports] = useState(true)
  const [processing, setProcessing] = useState(false)

  /* ================= FETCH REPORTS ================= */

  async function fetchReports() {

    setLoadingReports(true)

    const { data, error } = await supabase
      .from("property_reports")
      .select(`
        id,
        reason,
        created_at,
        properties (
          id,
          title,
          price,
          description,
          listing_type,
          property_type,
          ownership_verified,
          status,
          flagged,
          safety_status,
          created_at,
          cities(name),
          localities(name),
          seller_id,
          users:seller_id (
            full_name,
            phone,
            reputation_score
          )
        ),
        users (
          id,
          full_name
        )
      `)
      .order("created_at", { ascending: false })
      .limit(50)

    if (error) {
      console.error(error)
      setLoadingReports(false)
      return
    }

    setReports(data || [])
    setLoadingReports(false)
  }

  useEffect(() => {
    fetchReports()
  }, [])

  /* ================= LOAD PROPERTY IMAGES ================= */

  async function loadImages(propertyId: string) {

    setLoadingImages(true)

    const { data, error } = await supabase
      .from("property_images")
      .select("*")
      .eq("property_id", propertyId)

    if (error) {
      console.error(error)
      setLoadingImages(false)
      return
    }

    setImages(data || [])
    setLoadingImages(false)
  }

  useEffect(() => {
    if (!selected?.properties?.id) return
    loadImages(selected.properties.id)
  }, [selected])

  /* ================= IGNORE REPORT ================= */

  async function ignoreReport(report: any) {

    if (processing) return
    setProcessing(true)

    try {

      const { data } = await supabase.auth.getUser()
      const adminId = data.user?.id

      if (!adminId) throw new Error("Session expired")

      await logAction(
        adminId,
        "report",
        report.id,
        "ignore_report",
        "Admin dismissed report"
      )

      await supabase
        .from("property_reports")
        .delete()
        .eq("id", report.id)

      setSelected(null)
      setImages([])
      await fetchReports()

    } catch (err:any) {
      alert(err.message || "Failed to ignore report")
    }

    setProcessing(false)
  }

  /* ================= REMOVE PROPERTY (SOFT DELETE) ================= */

  async function removeProperty(report: any) {

    if (processing) return

    const reason = prompt("Reason for removing property")
    if (!reason) return

    setProcessing(true)

    try {

      const { data } = await supabase.auth.getUser()
      const adminId = data.user?.id

      if (!adminId) throw new Error("Session expired")

      await supabase
        .from("properties")
        .update({
          status: "deleted",
          deleted_at: new Date().toISOString(),
          flagged: true,
          safety_status: "flagged",
          rejection_reason: reason
        } as any)
        .eq("id", report.properties.id)

      await logAction(
        adminId,
        "property",
        report.properties.id,
        "delete_property",
        reason
      )

      await supabase
        .from("property_reports")
        .delete()
        .eq("id", report.id)

      setSelected(null)
      setImages([])
      await fetchReports()

    } catch (err:any) {
      alert(err.message || "Failed to remove property")
    }

    setProcessing(false)
  }

  /* ================= UI ================= */

  return (

    <div className="max-w-7xl mx-auto p-10">

      <h1 className="text-2xl font-semibold mb-8">
        Property Reports
      </h1>

      <div className="grid grid-cols-3 gap-6">

        {/* REPORT LIST */}

        <div className="border rounded-xl p-4">

          <h2 className="font-semibold mb-4">
            Reported Listings
          </h2>

          {loadingReports && (
            <p className="text-sm text-gray-500">Loading...</p>
          )}

          {!loadingReports && reports.length === 0 && (
            <p className="text-gray-500 text-sm">No reports</p>
          )}

          <div className="space-y-2">

            {reports.map(report => (

              <div
                key={report.id}
                onClick={() => setSelected(report)}
                className={`border rounded-md p-3 cursor-pointer hover:bg-gray-100 ${
                  selected?.id === report.id ? "bg-gray-100" : ""
                }`}
              >

                <div className="font-medium">
                  {report.properties?.title}
                </div>

                <div className="text-xs text-gray-500">
                  Reason: {report.reason}
                </div>

                <div className="text-xs text-gray-500">
                  Reporter: {report.users?.full_name}
                </div>

              </div>

            ))}

          </div>

        </div>

        {/* REVIEW PANEL */}

        <div className="col-span-2 border rounded-xl p-4">

          {!selected && (
            <p className="text-gray-500">
              Select a report to review
            </p>
          )}

          {selected && (

            <div>

              <div className="mb-4">

                <div className="text-lg font-semibold">
                  {selected.properties?.title}
                </div>

                <div className="text-sm text-gray-500">
                  ₹{selected.properties?.price}
                </div>

                <div className="text-sm text-red-600 mt-1">
                  Report Reason: {selected.reason}
                </div>

                <div className="text-sm text-gray-500">
                  Seller: {selected.properties?.users?.full_name}
                </div>

                <div className="text-sm text-gray-500">
                  Phone: {selected.properties?.users?.phone}
                </div>

                <div className="text-sm text-gray-500">
                  Reputation: {selected.properties?.users?.reputation_score}
                </div>

                <div className="text-sm text-gray-500">
                  Status: {selected.properties?.status}
                </div>

              </div>

              <div className="mb-6 text-sm text-gray-700">
                {selected.properties?.description}
              </div>

              <div className="grid grid-cols-3 gap-4 mb-6">

                {loadingImages && (
                  <p className="text-sm text-gray-500">
                    Loading images...
                  </p>
                )}

                {!loadingImages && images.length === 0 && (
                  <p className="text-sm text-gray-500">
                    No images uploaded
                  </p>
                )}

                {images.map(img => (
                  <img
                    key={img.id}
                    src={img.image_url}
                    className="rounded border"
                  />
                ))}

              </div>

              <div className="flex gap-4">

                <button
                  disabled={processing}
                  onClick={() => ignoreReport(selected)}
                  className="bg-gray-600 text-white px-4 py-2 rounded"
                >
                  Ignore Report
                </button>

                <button
                  disabled={processing}
                  onClick={() => removeProperty(selected)}
                  className="bg-red-600 text-white px-4 py-2 rounded"
                >
                  Delete Property
                </button>

              </div>

            </div>

          )}

        </div>

      </div>

    </div>

  )
}