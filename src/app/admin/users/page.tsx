"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { logAction } from "@/lib/moderation/logAction"

const supabase = createClient()

export default function AdminUsersPage() {

  const router = useRouter()

  const [users, setUsers] = useState<any[]>([])
  const [selected, setSelected] = useState<any>(null)

  const [loadingUsers, setLoadingUsers] = useState(true)
  const [processing, setProcessing] = useState(false)

  const [adminId, setAdminId] = useState<string | null>(null)

  /* ================= FETCH USERS ================= */

  async function fetchUsers() {

    setLoadingUsers(true)

    const { data, error } = await supabase
      .from("users")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100)

    if (error) {
      console.error(error)
      setLoadingUsers(false)
      return
    }

    setUsers(data || [])
    setLoadingUsers(false)
  }

  /* ================= GET ADMIN ================= */

  async function loadAdmin() {

    const { data } = await supabase.auth.getUser()
    setAdminId(data.user?.id || null)

  }

  useEffect(() => {
    fetchUsers()
    loadAdmin()
  }, [])

  function updateLocalUser(updated: any) {

    setUsers(prev =>
      prev.map(u => (u.id === updated.id ? updated : u))
    )

    setSelected(updated)

  }

  /* ================= REVOKE KYC ================= */

  async function revokeKYC(user: any) {

    const { data } = await supabase.auth.getUser()
    const adminId = data.user?.id

    if (!adminId) {
      alert("Session expired")
      return
    }

    if (user.role === "admin") return

    setProcessing(true)

    const { error } = await supabase
      .from("users")
      .update({
        kyc_status: "rejected",
        role: "buyer"
      })
      .eq("id", user.id)

    if (error) {
      console.error(error)
      setProcessing(false)
      return
    }

    await logAction(
      adminId,
      "user",
      user.id,
      "revoke_kyc",
      "Admin revoked KYC"
    )

    updateLocalUser({
      ...user,
      kyc_status: "rejected",
      role: "buyer"
    })

    setProcessing(false)
  }

  /* ================= PROMOTE SELLER ================= */

  async function promoteSeller(user: any) {

    if (user.kyc_status !== "approved") {
      alert("User KYC must be approved first")
      return
    }

    const { data } = await supabase.auth.getUser()
    const adminId = data.user?.id

    if (!adminId) {
      alert("Session expired")
      return
    }

    setProcessing(true)

    const { error } = await supabase
      .from("users")
      .update({ role: "seller" })
      .eq("id", user.id)

    if (error) {
      console.error(error)
      setProcessing(false)
      return
    }

    await logAction(
      adminId,
      "user",
      user.id,
      "promote_seller",
      "Admin promoted user"
    )

    updateLocalUser({ ...user, role: "seller" })

    setProcessing(false)
  }

  /* ================= DEMOTE SELLER ================= */

  async function demoteSeller(user: any) {

    const { data } = await supabase.auth.getUser()
    const adminId = data.user?.id

    if (!adminId) {
      alert("Session expired")
      return
    }

    if (user.role === "admin") return
    if (user.id === adminId) return

    setProcessing(true)

    const { error } = await supabase
      .from("users")
      .update({ role: "buyer" })
      .eq("id", user.id)

    if (error) {
      console.error(error)
      setProcessing(false)
      return
    }

    await logAction(
      adminId,
      "user",
      user.id,
      "demote_seller",
      "Admin demoted seller"
    )

    updateLocalUser({ ...user, role: "buyer" })

    setProcessing(false)
  }

  async function grantAdmin(user: any) {
    if (user.kyc_status !== "approved") {
      alert("User KYC must be approved first")
      return
    }

    const { data } = await supabase.auth.getUser()
    const adminId = data.user?.id

    if (!adminId) {
      alert("Session expired")
      return
    }

    setProcessing(true)

    const { error } = await supabase
      .from("users")
      .update({
        role: "admin",
        seller_status: "active"
      })
      .eq("id", user.id)

    if (error) {
      console.error(error)
      setProcessing(false)
      return
    }

    await logAction(
      adminId,
      "user",
      user.id,
      "grant_admin",
      "Admin granted elevated access"
    )

    updateLocalUser({ ...user, role: "admin", seller_status: "active" })

    setProcessing(false)
  }

  /* ================= UI ================= */

  return (

    <div className="max-w-7xl mx-auto p-10">

      <h1 className="text-2xl font-semibold mb-8">
        User Management
      </h1>

      <div className="grid grid-cols-3 gap-6">

        <div className="border rounded-xl p-4">

          <h2 className="font-semibold mb-4">
            Users
          </h2>

          {loadingUsers && (
            <p className="text-sm text-gray-500">
              Loading users...
            </p>
          )}

          <div className="space-y-2">

            {users.map(user => (

              <div
                key={user.id}
                onClick={() => setSelected(user)}
                className={`border rounded-md p-3 cursor-pointer hover:bg-gray-100 ${
                  selected?.id === user.id ? "bg-gray-100" : ""
                }`}
              >

                <div className="font-medium">
                  {user.full_name}
                </div>

                <div className="text-xs text-gray-500">
                  {user.email}
                </div>

                <div className="text-xs text-gray-500">
                  Role: {user.role}
                </div>

              </div>

            ))}

          </div>

        </div>

        <div className="col-span-2 border rounded-xl p-6">

          {!selected && (
            <p className="text-gray-500">
              Select a user
            </p>
          )}

          {selected && (

            <div>

              <div className="text-lg font-semibold mb-2">
                {selected.full_name}
              </div>

              <div className="text-sm text-gray-500 mb-4">
                {selected.email}
              </div>

              <div className="mb-2 text-sm">
                Phone: {selected.phone || "N/A"}
              </div>

              <div className="mb-2 text-sm">
                WhatsApp: {selected.whatsapp_number || "N/A"}
              </div>

              <div className="mb-2 text-sm">
                Role: {selected.role}
              </div>

              <div className="mb-2 text-sm">
                KYC Status: {selected.kyc_status}
              </div>

              <div className="mb-2 text-sm">
                Seller Status: {selected.seller_status}
              </div>

              {selected.seller_status === "admin_review_required" && (
                <div className="mb-3 inline-flex rounded-full bg-red-100 px-3 py-1 text-xs font-semibold uppercase text-red-700 ring-2 ring-red-300">
                  Admin upgrade requested
                </div>
              )}

              <div className="mb-2 text-sm">
                Reputation Score: {selected.reputation_score}
              </div>

              <div className="mb-2 text-sm">
                Joined: {new Date(selected.created_at).toLocaleDateString()}
              </div>

              <div className="flex flex-wrap gap-3">

                <button
                  onClick={() => router.push("/admin/kyc")}
                  disabled={selected.kyc_status !== "pending"}
                  className="bg-green-600 disabled:opacity-50 text-white px-4 py-2 rounded"
                >
                  Review KYC
                </button>

                <button
                  disabled={processing || selected.role === "admin"}
                  onClick={() => revokeKYC(selected)}
                  className="bg-red-600 disabled:opacity-50 text-white px-4 py-2 rounded"
                >
                  Revoke KYC
                </button>

                <button
                  disabled={processing || selected.role !== "buyer"}
                  onClick={() => promoteSeller(selected)}
                  className="bg-blue-600 disabled:opacity-50 text-white px-4 py-2 rounded"
                >
                  Promote Seller
                </button>

                <button
                  disabled={
                    processing ||
                    selected.role !== "seller" ||
                    selected.id === adminId
                  }
                  onClick={() => demoteSeller(selected)}
                  className="bg-gray-700 disabled:opacity-50 text-white px-4 py-2 rounded"
                >
                  Demote Seller
                </button>

                <button
                  disabled={
                    processing ||
                    selected.role === "admin" ||
                    selected.seller_status !== "admin_review_required"
                  }
                  onClick={() => grantAdmin(selected)}
                  className="bg-purple-700 disabled:opacity-50 text-white px-4 py-2 rounded"
                >
                  Approve Admin Access
                </button>

              </div>

            </div>

          )}

        </div>

      </div>

    </div>

  )
}
