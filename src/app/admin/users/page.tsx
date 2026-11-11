"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { logAction } from "@/lib/moderation/logAction"
import { useFormFeedback } from "@/lib/use-form-feedback"

const supabase = createClient()

export default function AdminUsersPage() {

  const router = useRouter()

  const [users, setUsers] = useState<any[]>([])
  const [selected, setSelected] = useState<any>(null)

  const [loadingUsers, setLoadingUsers] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [activatingSeller, setActivatingSeller] = useState(false)
  const [activationNote, setActivationNote] = useState("")
  const { feedback, feedbackRef, showFeedback } = useFormFeedback()
  useEffect(() => { setActivationNote(""); showFeedback(""); }, [selected?.id, showFeedback])

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
      alert(error.message || "Account action failed");
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
      alert(error.message || "Account action failed");
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
    if (processing) return;
    if (!activationNote.trim()) { showFeedback("Enter a seller activation review note first."); return; }
    showFeedback("");
    setProcessing(true);
    setActivatingSeller(true);
    try {
      const { error } = await supabase.rpc("admin_activate_verified_seller", { p_user_id: user.id, p_note: activationNote.trim() });
      if (error) throw new Error(error.message);
      const { data: savedUser, error: readError } = await supabase.from("users").select("*").eq("id", user.id).single();
      if (readError || !savedUser) {
        throw new Error("The activation request completed, but the saved account status could not be confirmed. Refresh this page before trying activation again. Your review note has been kept.");
      }
      updateLocalUser(savedUser);
      if (savedUser.role !== "seller" || savedUser.seller_status !== "active" || savedUser.kyc_status !== "approved" || !savedUser.owner_declaration_at) {
        throw new Error("The account is not fully active after the activation request. The displayed status has been refreshed; check its identity approval, declaration and seller status. Your review note has been kept.");
      }
      setActivationNote("");
      showFeedback(`Seller access activated successfully for ${savedUser.full_name || "this user"}. Saved account status confirmed: seller role, approved identity and active seller access. The user can refresh their Profile and open the dashboard. Property ownership reviews remain separate.`, "success");
    } catch (error) { showFeedback(error instanceof Error ? error.message : "Seller activation could not be confirmed. Your review note has been kept."); }
    finally { setProcessing(false); setActivatingSeller(false); }
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
      alert(error.message || "Account action failed");
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

  async function revokeStaffAdmin(user: any) {
    if (processing || user.user_id === adminId) return;
    if (!confirm("Revoke this staff member's admin access? Their listings will require review.")) return;
    setProcessing(true);
    try {
      const { error } = await supabase.rpc("manage_staff_admin", { p_user_id: user.id, p_grant: false });
      if (error) throw new Error(error.message);
      updateLocalUser({ ...user, role: "buyer", seller_status: "basic" });
    } catch (error) { alert(error instanceof Error ? error.message : "Staff access could not be revoked"); }
    finally { setProcessing(false); }
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

    const { error } = await supabase.rpc("manage_staff_admin", { p_user_id: user.id, p_grant: true })

    if (error) {
      alert(error.message || "Account action failed");
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
  const sellerAccessActive = selected?.role === "seller" && selected?.seller_status === "active" && selected?.kyc_status === "approved" && Boolean(selected?.owner_declaration_at);

  return (

    <div className="max-w-7xl mx-auto p-10">

      <h1 className="text-2xl font-semibold mb-8">
        User Management
      </h1>
      {feedback.text && <div ref={feedbackRef} tabIndex={-1} role={feedback.kind === "error" ? "alert" : "status"} className={`mb-6 rounded-lg border p-4 outline-none ${feedback.kind === "error" ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{feedback.text}</div>}

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
                onClick={() => { if (!processing) setSelected(user); }}
                aria-disabled={processing}
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

              {selected.role !== "admin" && <div className="mb-4 space-y-2"><p className="text-sm">Owner-only declaration: {selected.owner_declaration_at ? "Recorded" : "Not saved"}. Activation checks approved government ID and selfie files, and updates both seller role and active status.</p>{sellerAccessActive ? <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">Seller access is active. No additional activation note is needed. The user can refresh Profile and try opening their dashboard.</p> : <label className="block text-sm">Seller activation review note (required to activate)<textarea value={activationNote} disabled={processing} onChange={event => setActivationNote(event.target.value)} className="mt-2 block w-full rounded border p-2" placeholder="Record why the reviewed identity and declaration qualify this account for seller access." /></label>}</div>}
              <div className="flex flex-wrap gap-3">
                {selected.role === "admin" && <button type="button" disabled={processing || selected.user_id === adminId} onClick={() => revokeStaffAdmin(selected)} className="rounded bg-red-700 px-4 py-2 text-white disabled:opacity-50">Revoke staff admin</button>}

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
                  disabled={processing || selected.role === "admin" || selected.kyc_status !== "approved" || !activationNote.trim() || (selected.role === "seller" && selected.seller_status === "active")}
                  onClick={() => promoteSeller(selected)}
                  className="bg-blue-600 disabled:opacity-50 text-white px-4 py-2 rounded"
                >
                  {activatingSeller ? "Activating seller access…" : sellerAccessActive ? "✓ Seller access active" : "Activate Seller Access"}
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
                    selected.kyc_status !== "approved"
                  }
                  onClick={() => grantAdmin(selected)}
                  className="bg-purple-700 disabled:opacity-50 text-white px-4 py-2 rounded"
                >
                  Grant Staff Admin Access
                </button>

              </div>

            </div>

          )}

        </div>

      </div>

    </div>

  )
}
