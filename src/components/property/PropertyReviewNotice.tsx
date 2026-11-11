export type PropertyReviewRequest = { id?: string; reason: string; correction_scope: string; required_action: string; stage: string; resubmitted_at?: string | null };
export default function PropertyReviewNotice({ request, required }: { request?: PropertyReviewRequest | PropertyReviewRequest[] | null; required: boolean }) {
  const review = Array.isArray(request) ? request[0] : request;
  if (!review) return null;
  const category = ({ details: "Property details", documents: "New ownership documents", both: "Property details and new ownership documents", details_or_documents: "Details or ownership evidence" } as Record<string, string>)[review.correction_scope];
  return <div className={`space-y-2 rounded-xl border p-4 text-sm ${required ? "border-amber-200 bg-amber-50 text-amber-950" : "border-blue-200 bg-blue-50 text-blue-950"}`}>
    <p className="font-semibold">{required ? `${review.stage === "ownership" ? "Ownership" : "Listing"} rejected · Corrections needed` : "Resubmitted · Awaiting admin review"}</p>
    {required && <>
      <p className="whitespace-pre-wrap break-words"><strong>Reason: </strong>{review.reason}</p>
      <p><strong>Correct: </strong>{category}</p>
      <p className="whitespace-pre-wrap break-words"><strong>What to do: </strong>{review.required_action}</p>
      <p>Save your corrections first, then choose <strong>Resubmit for review</strong>. Saving alone does not send this listing to the admin.</p>
    </>}
  </div>;
}
