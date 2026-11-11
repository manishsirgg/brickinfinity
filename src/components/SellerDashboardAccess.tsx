import Link from "next/link";
import { sellerDashboardAccess, type SellerAccessProfile } from "@/lib/seller-dashboard-access";

type IdentityDocument = { status?: string; document_url?: string } | null;
export default function SellerDashboardAccess({ profile, documents, rejectionReason, onRefresh }: {
  profile: SellerAccessProfile;
  documents: Record<string, IdentityDocument>;
  rejectionReason?: string | null;
  onRefresh: () => void;
}) {
  const access = sellerDashboardAccess(profile);
  const governmentId = [documents.aadhar, documents.passport, documents.driving_license];
  const hasId = governmentId.some(doc => doc?.document_url);
  const approvedId = governmentId.some(doc => doc?.document_url && doc.status === "approved");
  const selfie = documents.selfie;
  return <section id="seller-access" className="scroll-mt-28 space-y-3 rounded-xl border-2 border-dashed p-6">
    <h2 className="text-lg font-semibold">Seller dashboard access</h2>
    {profile.role !== "admin" && <div className="space-y-3 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
      <h3 className="font-semibold">To become a seller, all three are mandatory</h3>
      <p>Completing only one or two is not enough. Upload the documents and save your declaration here, then wait for admin identity approval and seller activation.</p>
      <ol className="list-decimal space-y-2 pl-5">
        <li><strong>One government ID:</strong> Aadhaar, Passport or Driving License. <span>{approvedId ? "Approved" : hasId ? "Uploaded — approval required" : "Not uploaded"}</span></li>
        <li><strong>A matching selfie:</strong> Used to confirm that the ID belongs to you. <span>{selfie?.status === "approved" && selfie.document_url ? "Approved" : selfie?.document_url ? "Uploaded — approval required" : "Not uploaded"}</span></li>
        <li><strong>The owner-only declaration:</strong> Confirm you are an actual owner or project-owning builder, not an agent or broker. <span>{profile.ownerDeclared ? "Recorded" : "Not saved"}</span></li>
      </ol>
      <p>Identity approval does not verify ownership of every property. Each listing requires its own ownership review.</p>
    </div>}
    {access.allowed ? <><p className="text-sm text-emerald-800">{profile.role === "admin" ? "Staff admin access is active." : "Your owner declaration, identity approval and seller activation are complete."}</p><Link prefetch={false} className="btn-primary inline-flex" href="/dashboard">Open seller dashboard</Link></> : <>
      <p className="text-sm text-amber-900">Your dashboard is waiting for the steps below. Saving an owner declaration does not by itself activate seller access.</p>
      <ul className="list-disc space-y-2 pl-5 text-sm">
        {!profile.ownerDeclared && <li>Accept and save the owner-only declaration below.</li>}
        {!hasId ? <li>Upload one government ID: Aadhaar, Passport or Driving License.</li> : !approvedId && <li>A government ID needs admin approval. Check the document status below.</li>}
        {!selfie?.document_url ? <li>Upload a selfie below. An approved government ID alone does not complete identity verification.</li> : selfie.status !== "approved" && <li>Your selfie needs admin approval. Check the document status below.</li>}
        {profile.kycStatus === "rejected" ? <li>Identity verification was rejected: {rejectionReason || "Contact support for the review reason."}</li> : profile.kycStatus !== "approved" && <li>Wait for an admin to approve your identity verification after reviewing the ID and selfie.</li>}
        {(profile.role !== "seller" || profile.sellerStatus !== "active") && <li>Seller access is not active yet. {hasId && approvedId && selfie?.status === "approved" && profile.ownerDeclared ? "Ask an admin to use Activate Seller Access on your account in Admin → Users after reviewing your evidence. Saving the declaration again does not override restricted access." : "Complete the identity steps above; an admin must activate seller access. Existing restrictions require admin review."}</li>}
      </ul>
      <p className="text-xs text-slate-600">Identity status: {profile.kycStatus || "not submitted"} · Seller status: {profile.sellerStatus || "not active"}. Each property still requires separate ownership review.</p>
      {access.reason === "identity-review" && <Link prefetch={false} href="/seller-review" className="inline-flex rounded-lg border px-3 py-2 text-sm">View read-only review dashboard</Link>}
    </>}
    <button type="button" onClick={onRefresh} className="rounded-lg border px-3 py-2 text-sm">Refresh access status</button>
  </section>;
}
