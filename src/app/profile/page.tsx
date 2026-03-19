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
}

interface DocumentRow {
  id: string;
  document_type: DocumentType;
  document_url: string;
  status: string;
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

  /* Load KYC docs */

  const { data: docs } = await supabase
    .from("documents")
    .select("id, document_type, document_url, status")
    .eq("user_id", data.id);
    setDocumentsList(docs || []);

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
      .update({ kyc_status: "pending" })
      .eq("user_id", sessionUser.id);

    setMessage(`${type.replace("_", " ")} uploaded.`);
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

              <input
                type="file"
                accept="image/*"
                onChange={handleAvatarUpload}
              />

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
    Seller Verification Status
  </h2>

  {kycComplete ? (
    <p className="text-green-600 text-sm">
      ✔ Required documents uploaded. Awaiting admin approval.
    </p>
  ) : (
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

      <p className="text-gray-500 pt-1">
        Seller access unlocks after both are approved.
      </p>

    </div>
  )}

</Card>

          {/* KYC */}

          <Card className="p-6 space-y-6">

            <h2 className="text-lg font-semibold">
              Seller Verification
            </h2>

            <div className="grid sm:grid-cols-2 gap-6">

              {(
                ["aadhar","passport","driving_license","selfie"] as DocumentType[]
              ).map((type)=>{

                const doc = documents[type];

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
  type="file"
  accept={type === "selfie" ? "image/*" : "image/*,.pdf"}
  disabled={uploadingKyc}
                      onChange={(e:any)=>{
                        const file=e.target.files?.[0];
                        if(file) uploadKycDocument(file,type);
                      }}
                    />

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