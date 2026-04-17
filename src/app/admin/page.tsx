"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"

const supabase = createClient()

export default function AdminDashboard() {

  const [stats, setStats] = useState({
    kyc: 0,
    ownership: 0,
    properties: 0,
    reports: 0,
    users: 0
  })

  const [loading, setLoading] = useState(true)

  /* ================= FETCH STATS ================= */

  async function fetchStats() {

    setLoading(true)

    const { data } = await supabase.auth.getUser()

    if (!data?.user) {
      alert("Session expired. Please login again.")
      setLoading(false)
      return
    }

    try {

      const [
        kycRes,
        ownershipRes,
        propertyRes,
        reportRes,
        userRes
      ] = await Promise.all([

        /* ================= KYC ================= */

        supabase
          .from("documents")
          .select("*", { count: "exact", head: true })
          .is("property_id", null)
          .eq("status", "pending"),

        /* ================= OWNERSHIP ================= */

        supabase
          .from("documents")
          .select("*", { count: "exact", head: true })
          .not("property_id", "is", null)
          .eq("document_type","ownership")
          .eq("status", "pending"),

        /* ================= READY FOR ACTIVATION ================= */

        supabase
          .from("properties")
          .select("*", { count: "exact", head: true })
          .eq("status","pending")
          .eq("ownership_verified", true)
          .is("deleted_at", null),

        /* ================= REPORTS ================= */

        supabase
          .from("property_reports")
          .select("*", { count: "exact", head: true }),

        /* ================= USERS ================= */

        supabase
          .from("users")
          .select("*", { count: "exact", head: true })

      ])

      setStats({
        kyc: kycRes.count || 0,
        ownership: ownershipRes.count || 0,
        properties: propertyRes.count || 0,
        reports: reportRes.count || 0,
        users: userRes.count || 0
      })

    } catch (err) {
      console.error("Dashboard stats error:", err)
    }

    setLoading(false)
  }

  useEffect(() => {
    fetchStats()
  }, [])

  /* ================= UI ================= */

  return (

    <div className="max-w-7xl mx-auto p-10">

      <div className="flex justify-between items-center mb-8">

        <h1 className="text-2xl font-semibold">
          Admin Console
        </h1>

        <button
          onClick={fetchStats}
          className="border px-4 py-2 rounded hover:bg-gray-100 text-sm"
        >
          Refresh
        </button>

      </div>

      {loading && (
        <p className="text-gray-500 mb-6">
          Loading platform stats...
        </p>
      )}

      <div className="grid grid-cols-3 gap-6">

        <Link href="/admin/kyc" className="border rounded-xl p-6 hover:bg-gray-50">
          <div className="text-lg font-semibold">KYC Verification</div>
          <div className="text-sm text-gray-500 mt-1">
            Pending: {stats.kyc}
          </div>
        </Link>

        <Link href="/admin/ownership" className="border rounded-xl p-6 hover:bg-gray-50">
          <div className="text-lg font-semibold">Ownership Documents</div>
          <div className="text-sm text-gray-500 mt-1">
            Pending: {stats.ownership}
          </div>
        </Link>

        <Link href="/admin/properties" className="border rounded-xl p-6 hover:bg-gray-50">
          <div className="text-lg font-semibold">Property Listings</div>
          <div className="text-sm text-gray-500 mt-1">
            Total Pending Review: {stats.properties}
          </div>
        </Link>

        <Link href="/dashboard/add-property" className="border rounded-xl p-6 hover:bg-gray-50">
          <div className="text-lg font-semibold">Create Property (Admin)</div>
          <div className="text-sm text-gray-500 mt-1">
            Publish directly without ownership approval
          </div>
        </Link>

        <Link href="/admin/reports" className="border rounded-xl p-6 hover:bg-gray-50">
          <div className="text-lg font-semibold">Reports</div>
          <div className="text-sm text-gray-500 mt-1">
            Total Reports: {stats.reports}
          </div>
        </Link>

        <Link href="/admin/users" className="border rounded-xl p-6 hover:bg-gray-50">
          <div className="text-lg font-semibold">Users</div>
          <div className="text-sm text-gray-500 mt-1">
            Total Users: {stats.users}
          </div>
        </Link>

        <Link href="/admin/blogs" className="border rounded-xl p-6 hover:bg-gray-50">
          <div className="text-lg font-semibold">Blogs</div>
          <div className="text-sm text-gray-500 mt-1">
            Admin-only publishing
          </div>
        </Link>

        <Link href="/admin/logs" className="border rounded-xl p-6 hover:bg-gray-50">
          <div className="text-lg font-semibold">Moderation Logs</div>
          <div className="text-sm text-gray-500 mt-1">
            Audit Trail
          </div>
        </Link>

      </div>

    </div>
  )
}
