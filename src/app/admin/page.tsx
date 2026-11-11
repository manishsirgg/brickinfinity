"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"

import { loadAdminDashboardStats } from "@/lib/admin-dashboard-stats"

const supabase = createClient()

export default function AdminDashboard() {

  const [stats, setStats] = useState({
    kyc: 0,
    ownership: 0,
    properties: 0,
    ready: 0,
    reports: 0,
    users: 0,
    leads: 0
  })

  const [loading, setLoading] = useState(true)

  const [error, setError] = useState("")
  const requestVersion = useRef(0)
  const invalidateRequests = useCallback(() => { ++requestVersion.current }, [])
  const fetchStats = useCallback(async () => {
    const version = ++requestVersion.current
    setLoading(true); setError("")
    try {
      const { data, error: authError } = await supabase.auth.getUser()
      if (authError || !data?.user) throw new Error("Session expired. Please sign in again.")
      const next = await loadAdminDashboardStats(supabase)
      if (version === requestVersion.current) setStats(next)
    } catch (error) {
      if (version === requestVersion.current) setError(error instanceof Error ? error.message : "Could not load dashboard counts.")
    } finally {
      if (version === requestVersion.current) setLoading(false)
    }
  }, [])
  useEffect(() => {
    void fetchStats()
    const refresh = () => { if (document.visibilityState === "visible") void fetchStats() }
    window.addEventListener("focus", refresh)
    window.addEventListener("pageshow", refresh)
    document.addEventListener("visibilitychange", refresh)
    return () => {
      invalidateRequests()
      window.removeEventListener("focus", refresh)
      window.removeEventListener("pageshow", refresh)
      document.removeEventListener("visibilitychange", refresh)
    }
  }, [fetchStats, invalidateRequests])
  const count = (value: number) => loading ? "…" : error ? "Unavailable" : value

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

      {error && <p role="alert" className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">{error} Counts are unavailable; use Refresh to retry.</p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">

        <Link href="/admin/kyc" className="border rounded-xl p-6 hover:bg-gray-50">
          <div className="text-lg font-semibold">KYC Verification</div>
          <div className="text-sm text-gray-500 mt-1">
            Pending: {count(stats.kyc)}
          </div>
        </Link>

        <Link href="/admin/ownership" className="border rounded-xl p-6 hover:bg-gray-50">
          <div className="text-lg font-semibold">Ownership Documents</div>
          <div className="text-sm text-gray-500 mt-1">
            Pending: {count(stats.ownership)}
          </div>
        </Link>

        <Link href="/admin/properties" className="border rounded-xl p-6 hover:bg-gray-50">
          <div className="text-lg font-semibold">Property Listings</div>
          <div className="text-sm text-gray-500 mt-1">
            Total Pending Review: {count(stats.properties)}
            <p className="mt-1">Ready for publication: {count(stats.ready)}</p>
            <p className="mt-1">Ownership reviews are handled in Ownership Documents. Listings without evidence still need the seller to upload it.</p>
          </div>
        </Link>

        <Link href="/dashboard/add-property" className="border rounded-xl p-6 hover:bg-gray-50">
          <div className="text-lg font-semibold">Create Property (Admin)</div>
          <div className="text-sm text-gray-500 mt-1">
            Publish directly without ownership approval
          </div>
        </Link>


        <Link href="/dashboard/my-listings" className="border rounded-xl p-6 hover:bg-gray-50">
          <div className="text-lg font-semibold">Admin-Created Properties</div>
          <div className="text-sm text-gray-500 mt-1">
            View, edit, or delete properties created by admin
          </div>
        </Link>

        <Link href="/admin/reports" className="border rounded-xl p-6 hover:bg-gray-50">
          <div className="text-lg font-semibold">Reports</div>
          <div className="text-sm text-gray-500 mt-1">
            Total Reports: {count(stats.reports)}
          </div>
        </Link>

        <Link href="/admin/users" className="border rounded-xl p-6 hover:bg-gray-50">
          <div className="text-lg font-semibold">Users</div>
          <div className="text-sm text-gray-500 mt-1">
            Total Users: {count(stats.users)}
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

        <Link href="/admin/leads" className="border rounded-xl p-6 hover:bg-gray-50">
          <div className="text-lg font-semibold">Admin Leads</div>
          <div className="text-sm text-gray-500 mt-1">
            Total Leads: {count(stats.leads)}
          </div>
        </Link>

      

        <Link href="/admin/finance" className="border rounded-xl p-6 hover:bg-gray-50">
          <div className="text-lg font-semibold">Finance & Payments</div>
          <div className="text-sm text-gray-500 mt-1">
            Track Featured revenue, payment status, and activation issues.
          </div>
        </Link>

        <Link href="/admin/property-featured/reconciliation" className="border rounded-xl p-6 hover:bg-gray-50">
          <div className="text-lg font-semibold">Featured Payment Reconciliation</div>
          <div className="text-sm text-gray-500 mt-1">
            Recover captured Razorpay payments for Featured listings
          </div>
        </Link>
</div>

    </div>
  )
}
