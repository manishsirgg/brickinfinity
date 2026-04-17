"use client";

import { useEffect, useState, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { createClient } from "@/lib/supabase/client";
import { uploadImage } from "@/lib/storage/uploadImage";
import { deleteImage } from "@/lib/storage/deleteImage";

const supabase = createClient();

/* ================= TYPES ================= */

type DocumentType =
  | "aadhar"
  | "passport"
  | "driving_license"
  | "selfie";

interface Profile {
  id: string;
  user_id: string;
  full_name: string;
  phone: string | null;
  whatsapp_number: string | null;
  avatar_url: string | null;
  kyc_status: string;
  seller_status?: string | null;
  role?: string | null;
}

interface DocumentRow {
  id: string;
  document_type: DocumentType;
  document_url: string;
  status: string;
  rejection_reason?: string | null;
}

/* ================= PAGE ================= */

export default function ProfilePage() {
  const searchParams = useSearchParams();
  const upgradeType = searchParams.get("upgrade");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingKyc, setUploadingKyc] = useState(false);

  const [sessionUser, setSessionUser] = useState<any>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  const [documents, setDocuments] = useState<
    Record<DocumentType, DocumentRow | null>
  >({
    aadhar: null,
    passport: null,
    driving_license: null,
    selfie: null,
  });
  const [documentsList, setDocumentsList] = useState<DocumentRow[]>([]);
  const [newPassword, setNewPassword] = useState("");
  const [newEmail, setNewEmail] = useState("");

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [upgradeTarget, setUpgradeTarget] =
    useState<"seller" | "admin">("seller");
  const [kycRejectionReason, setKycRejectionReason] = useState<string | null>(null);

  useEffect(() => {

  if (message || error) {

    window.scrollTo({
      top: 0,
      behavior: "smooth"
    });

  }

}, [message, error]);

  /* ================= PASSWORD STRENGTH ================= */

  const passwordStrength = useMemo(() => {
    if (!newPassword) return null;

    let score = 0;
    if (newPassword.length >= 8) score++;
    if (/[A-Z]/.test(newPassword)) score++;
    if (/[0-9]/.test(newPassword)) score++;
    if (/[^A-Za-z0-9]/.test(newPassword)) score++;

    if (score <= 1) return { label: "Weak", color: "text-red-500" };
    if (score <= 3) return { label: "Moderate", color: "text-yellow-500" };
    return { label: "Strong", color: "text-green-600" };
  }, [newPassword]);

  /* ================= PROFILE COMPLETION ================= */

  const profileCompletion = useMemo(() => {
    if (!profile) return 0;

    let score = 0;
    if (profile.full_name) score++;
    if (profile.phone) score++;
    if (profile.whatsapp_number) score++;
    if (profile.avatar_url) score++;
    if (profile.kyc_status === "approved") score++;

    return Math.round((score / 5) * 100);
  }, [profile]);

  /* ================= FETCH PROFILE ================= */

  useEffect(() => {
    fetchProfile();
  }, []);

  async function fetchProfile() {

  const {
    data: { session },
    error: sessionError
  } = await supabase.auth.getSession();

  if (sessionError || !session) {
    setError("Session expired. Please login again.");
    setLoading(false);
    return;
  }

  setSessionUser(session.user);
  setNewEmail(session.user.email || "");

  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("user_id", session.user.id)
    .single();

  if (error || !data) {
    console.error("Profile fetch failed:", error);
    setError("Profile not found. Please contact support.");
    setLoading(false);
    return;
  }

  setProfile(data);
  setUpgradeTarget(
    data.seller_status === "pending_admin" ? "admin" : "seller"
  );

  /* Load KYC docs */

  const { data: docs } = await supabase
    .from("documents")
    .select("id, document_type, document_url, status, rejection_reason")
    .eq("user_id", data.id);
    setDocumentsList(docs || []);
    const rejectionDoc = (docs || []).find((doc: any) => doc.status === "rejected" && doc.rejection_reason);
    setKycRejectionReason(rejectionDoc?.rejection_reason || null);

  const map: Record<DocumentType, DocumentRow | null> = {
    aadhar: null,
    passport: null,
    driving_license: null,
    selfie: null,
  };

  docs?.forEach((d: any) => {
    if (d.document_type && d.document_type in map) {
      map[d.document_type as DocumentType] = d;
    }
  });

  setDocuments(map);
  setLoading(false);
}

  /* ================= PROFILE UPDATE ================= */

  async function handleSaveProfile() {
    if (!profile || !sessionUser) return;

    setSaving(true);
    setError("");
    setMessage("");

    const { error } = await supabase
  .from("users")
  .update({
    full_name: profile.full_name.trim(),
    phone: profile.phone?.trim() || null,
    whatsapp_number: profile.whatsapp_number?.trim() || null,
  })
  .eq("user_id", sessionUser.id);

    if (error) setError(error.message);
    else setMessage("Profile updated successfully.");

    setSaving(false);
  }

  /* ================= AVATAR ================= */

  async function handleAvatarUpload(
    e: React.ChangeEvent<HTMLInputElement>
  ) {
    if (!sessionUser) return;

    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingAvatar(true);

    try {
      const result = await uploadImage({
        file,
        bucket: "avatars",
        folder: sessionUser.id,
        maxSizeMB: 0.8,
      });

      if (profile?.avatar_url) {
        const oldPath = profile.avatar_url.split("/avatars/")[1];
        if (oldPath) await deleteImage("avatars", oldPath);
      }

      await supabase
        .from("users")
        .update({ avatar_url: result.url })
        .eq("user_id", sessionUser.id);

      setProfile((prev) =>
        prev ? { ...prev, avatar_url: result.url } : prev
      );

      setMessage("Avatar updated successfully.");
    } catch (err: any) {
      setError(err.message || "Avatar upload failed.");
    }

    setUploadingAvatar(false);
  }

  /* ================= EMAIL ================= */

  async function handleEmailChange() {
    const { error } = await supabase.auth.updateUser({
      email: newEmail.toLowerCase(),
    });

    if (error) setError(error.message);
    else setMessage("Verification email sent.");
  }

  /* ================= PASSWORD ================= */

  async function handlePasswordChange() {
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) setError(error.message);
    else {
      setMessage("Password updated.");
      setNewPassword("");
    }
  }

  /* ================= KYC UPLOAD ================= */

 async function uploadKycDocument(file: File, type: DocumentType) {

  if (!profile || !sessionUser) return;

  setUploadingKyc(true);

  try {

    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "application/pdf",
    ];

    if (!allowedTypes.includes(file.type)) {
      setError("Only JPG, PNG or PDF allowed.");
      setUploadingKyc(false);
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError("File must be under 10MB.");
      setUploadingKyc(false);
      return;
    }

    const path = `${sessionUser.id}/${type}/${Date.now()}-${file.name}`;

    const { error: uploadError } =
      await supabase.storage
        .from("identity-documents")
        .upload(path, file);

    if (uploadError) throw uploadError;

    const existing = documents[type];

    /* DELETE OLD FILE IF EXISTS */

if (existing?.document_url) {
  try {
    await deleteImage("identity-documents", existing.document_url);
  } catch (err) {
    console.warn("Old KYC delete failed", err);
  }
}

    let documentId: string;

    if (!existing) {

      const { data: doc, error: insertError } = await supabase
        .from("documents")
        .insert({
          user_id: profile.id,
          document_type: type,
          document_url: path,
          status: "pending",
        })
        .select()
        .single();

      if (insertError) throw insertError;

      documentId = doc.id;

    } else {

      documentId = existing.id;

      const { error: updateError } = await supabase
        .from("documents")
        .update({
          document_url: path,
          status: "pending",
        })
        .eq("id", existing.id);

      if (updateError) throw updateError;

    }

    const { error: versionError } = await supabase
      .from("document_versions")
      .insert({
        document_id: documentId,
        document_url: path,
        uploaded_by: profile.id,
      });

    if (versionError) throw versionError;

    await supabase
      .from("users")
      .update({
        kyc_status: "pending",
        seller_status:
          upgradeTarget === "admin"
            ? "pending_admin"
            : "pending_seller",
      })
      .eq("user_id", sessionUser.id);

    setMessage(
      upgradeTarget === "admin"
        ? `${type.replace("_", " ")} uploaded. Admin access request recorded and sent for manual review after KYC approval.`
        : `${type.replace("_", " ")} uploaded for seller verification.`
    );
    fetchProfile();

  } catch (err: any) {

    setError(err.message || "Upload failed.");

  }

  setUploadingKyc(false);
}

const hasGovtId = documentsList.some(
  (d) =>
    d.document_type === "aadhar" ||
    d.document_type === "passport" ||
    d.document_type === "driving_license"
);

const hasSelfie = documentsList.some(
  (d) => d.document_type === "selfie"
);

const kycComplete = hasGovtId && hasSelfie;
const approvalTarget =
  profile?.role === "admin" || profile?.seller_status === "admin_review_required"
    ? "admin"
    : "seller";

  if (loading)
    return (
      <div className="container-custom py-20 text-center">
        Loading...
      </div>
    );

  /* ================= UI ================= */

  return (
    <main className="container-custom py-12 md:py-20 space-y-12">
      <h1 className="text-2xl md:text-3xl font-semibold">
        Account Settings
      </h1>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {message && (
        <div className="bg-green-50 border border-green-200 text-green-700 p-3 rounded-lg text-sm">
          {message}
        </div>
      )}

      {/* PROFILE COMPLETION */}

      <Card className="p-6 space-y-4">
        <h2 className="text-lg font-semibold">
          Profile Completion
        </h2>

        <div className="w-full bg-gray-200 h-3 rounded-full overflow-hidden">
          <div
            className="h-full bg-red-600"
            style={{ width: `${profileCompletion}%` }}
          />
        </div>

        <p className="text-sm text-gray-600">
          {profileCompletion}% completed
        </p>
      </Card>

      {/* MAIN GRID */}

      <div className="grid lg:grid-cols-3 gap-10">

        {/* LEFT SIDE */}

        <div className="lg:col-span-2 space-y-10">

          {/* PROFILE */}

          <Card className="p-6 space-y-6">

            <h2 className="text-lg font-semibold">
              Profile Information
            </h2>

            <div className="flex items-center gap-6">

              <div className="w-24 h-24 rounded-full overflow-hidden bg-gray-200">
                {profile?.avatar_url && (
                  <img
                    src={profile.avatar_url}
                    className="w-full h-full object-cover"
                  />
                )}
              </div>

              <div className="space-y-2">
                <input
                  id="avatar-upload"
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={handleAvatarUpload}
                />
                <label
                  htmlFor="avatar-upload"
                  className="inline-flex cursor-pointer items-center rounded-full bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-black"
                >
                  {uploadingAvatar ? "Uploading..." : "Choose Profile Image"}
                </label>
                {!uploadingAvatar && (
                  <p className="text-xs text-gray-500">PNG/JPG recommended.</p>
                )}
              </div>

            </div>

            <div className="grid md:grid-cols-3 gap-6">

              <Input
                value={profile?.full_name || ""}
                onChange={(e:any)=>setProfile(prev=>prev?{...prev,full_name:e.target.value}:prev)}
              />

              <Input
                value={profile?.phone || ""}
                onChange={(e:any)=>setProfile(prev=>prev?{...prev,phone:e.target.value}:prev)}
              />

              <Input
                value={profile?.whatsapp_number || ""}
                onChange={(e:any)=>setProfile(prev=>prev?{...prev,whatsapp_number:e.target.value}:prev)}
              />

            </div>

            <Button onClick={handleSaveProfile}>
              Save Changes
            </Button>

          </Card>

          <Card className="p-6 space-y-3 border-2 border-dashed">
            <h2 className="text-lg font-semibold">
              Application Status
            </h2>

            {profile?.kyc_status === "pending" && (
              <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
                Your documents have been uploaded and are awaiting admin approval.
              </p>
            )}

            {profile?.kyc_status === "approved" && approvalTarget === "seller" && (
              <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg p-3">
                Your seller application has been approved. You can now list properties.
              </p>
            )}

            {profile?.kyc_status === "approved" && approvalTarget === "admin" && (
              <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg p-3">
                Your admin application has been approved. You now have admin access.
              </p>
            )}

            {profile?.kyc_status === "rejected" && (
              <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 space-y-1">
                <p>Your application has been rejected.</p>
                <p>
                  <span className="font-semibold">Reason for rejection:</span>{" "}
                  {kycRejectionReason || "No reason provided yet. Please contact support."}
                </p>
              </div>
            )}

            {profile?.kyc_status !== "pending" &&
              profile?.kyc_status !== "approved" &&
              profile?.kyc_status !== "rejected" && (
                <div className="text-sm space-y-1">
                  {!hasGovtId && (
                    <p className="text-red-600">
                      • Upload any ONE government ID (Aadhaar / Passport / Driving License)
                    </p>
                  )}

                  {!hasSelfie && (
                    <p className="text-red-600">
                      • Upload Selfie for identity confirmation
                    </p>
                  )}
                </div>
              )}
          </Card>

          {/* KYC */}

	          <Card className="p-6 space-y-6">

	            <h2 className="text-lg font-semibold">
	              Seller Verification
	            </h2>

              {uploadingKyc && (
                <p className="text-sm text-blue-600">Uploading document... Please wait.</p>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Upgrade request type
                </label>
                <select
                  value={upgradeTarget}
                  disabled={uploadingKyc || profile?.kyc_status === "approved"}
                  onChange={(e) =>
                    setUpgradeTarget(
                      e.target.value === "admin" ? "admin" : "seller"
                    )
                  }
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                >
                  <option value="seller">Upgrade to Seller</option>
                  <option value="admin">Request Admin Upgrade</option>
                </select>
                <p className="text-xs text-gray-500">
                  Admin upgrade requests are never automatic; they require
                  manual approval by an existing admin after KYC review.
                </p>
              </div>

	            <div className="grid sm:grid-cols-2 gap-6">

              {(
                ["aadhar","passport","driving_license","selfie"] as DocumentType[]
              ).map((type)=>{

                const doc = documents[type];
                const labelMap: Record<DocumentType, string> = {
                  aadhar: "Upload Aadhaar",
                  passport: "Upload Passport",
                  driving_license: "Upload Driving License",
                  selfie: "Upload Selfie",
                };
                const helperMap: Record<DocumentType, string> = {
                  aadhar: "Upload ID Proof",
                  passport: "Upload ID Proof",
                  driving_license: "Upload ID Proof",
                  selfie: "Upload Face Verification Selfie",
                };

                return (
                  <div
                    key={type}
                    className="border rounded-lg p-4 space-y-3"
                  >

                    <p className="font-medium capitalize">
                      {type.replace("_"," ")}
                    </p>

                    {doc ? (
  <div className={`text-xs font-medium ${
    doc.status === "approved"
      ? "text-green-600"
      : doc.status === "rejected"
      ? "text-red-600"
      : "text-yellow-600"
  }`}>
    {doc.status === "approved"
      ? "Approved ✓"
      : doc.status === "rejected"
      ? "Rejected"
      : "Pending Review"}
  </div>
) : (
  <div className="text-gray-500 text-xs">
    Not uploaded
  </div>
)}

                    <input
                      id={`kyc-upload-${type}`}
                      type="file"
                      accept={type === "selfie" ? "image/*" : "image/*,.pdf"}
                      disabled={uploadingKyc}
                      className="sr-only"
                      onChange={(e:any)=>{
                        const file=e.target.files?.[0];
                        if(file) uploadKycDocument(file,type);
                      }}
                    />
                    <label
                      htmlFor={`kyc-upload-${type}`}
                      className="inline-flex cursor-pointer items-center rounded-full bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      {uploadingKyc ? "Uploading..." : labelMap[type]}
                    </label>
                    <p className="text-xs text-gray-500">{helperMap[type]}</p>

                  </div>
                )

              })}

            </div>

          </Card>

        </div>

        {/* RIGHT SIDE */}

        <div className="space-y-10">

          <Card className="p-6 space-y-4">

            <h2 className="text-lg font-semibold">
              Change Email
            </h2>

            <Input
              value={newEmail}
              onChange={(e:any)=>setNewEmail(e.target.value)}
            />

            <Button onClick={handleEmailChange}>
              Update Email
            </Button>

          </Card>

          <Card className="p-6 space-y-4">

            <h2 className="text-lg font-semibold">
              Change Password
            </h2>

            <Input
              type="password"
              value={newPassword}
              onChange={(e:any)=>setNewPassword(e.target.value)}
            />

            {passwordStrength && (
              <p className={`text-xs ${passwordStrength.color}`}>
                Strength: {passwordStrength.label}
              </p>
            )}

            <Button onClick={handlePasswordChange}>
              Update Password
            </Button>

          </Card>

        </div>

      </div>

    </main>
  );
}
