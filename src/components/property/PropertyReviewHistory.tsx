import type { PropertyReviewRequest } from "./PropertyReviewNotice";
export type ReviewHistoryItem = PropertyReviewRequest & { id: string; created_at: string; submitted_to?: string | null; imported_legacy?: boolean };
export default function PropertyReviewHistory({ reviews }: { reviews: ReviewHistoryItem[] }) {
  if (!reviews.length) return null;
  return <details className="rounded-xl border p-4 text-sm">
    <summary className="cursor-pointer font-semibold">Rejection and resubmission history</summary>
    <ul className="mt-4 space-y-4">
      {reviews.map(review => <li key={review.id} className="space-y-1 border-t pt-3">
        <p className="font-medium">{review.stage === "ownership" ? "Ownership" : "Listing"} rejection · {review.imported_legacy ? "Earlier decision (imported)" : new Date(review.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</p>
        <p className="whitespace-pre-wrap break-words"><strong>Reason: </strong>{review.reason}</p>
        <p className="whitespace-pre-wrap break-words"><strong>Required correction: </strong>{review.required_action}</p>
        <p>{review.resubmitted_at ? `Resubmitted to ${review.submitted_to} review on ${new Date(review.resubmitted_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}` : "Awaiting seller corrections and resubmission"}</p>
      </li>)}
    </ul>
  </details>;
}
