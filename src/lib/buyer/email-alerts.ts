import type { SupabaseClient } from "@supabase/supabase-js";
export function searchEmailConfigured() { return Boolean(process.env.RESEND_API_KEY && process.env.ALERT_EMAIL_FROM); }
type EmailClaim = { id: string; token: string; to: string; from: string; subject: string; text: string };
export async function runSearchAlerts(db: SupabaseClient) {
  const result = { inAppMatches: 0, listingChangesProcessed: 0, emailConfigured: searchEmailConfigured(), emailAccepted: 0, emailFailed: 0, emailDeferred: 0 };
  for (let batch = 0; batch < 4; batch++) {
    const { data, error } = await db.rpc("process_saved_search_events", { p_limit: 25 });
    if (error) throw Error("Matching alerts could not be processed.");
    result.inAppMatches += Number(data?.matches || 0);
    result.listingChangesProcessed += Number(data?.processed || 0);
    if (Number(data?.processed || 0) < 25) break;
  }
  if (!result.emailConfigured) return result;
  const deadline = Date.now() + 35000;
  for (let i = 0; i < 20 && Date.now() < deadline; i++) {
    const { data, error: claimError } = await db.rpc("claim_search_alert_email", { p_from: process.env.ALERT_EMAIL_FROM });
    if (claimError) throw Error("Email queue could not be claimed.");
    if (!data) break;
    const claim = data as EmailClaim;
    let outcome: "accepted" | "retry" | "failed" = "retry", providerId: string | null = null;
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST", headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": `saved-search-${claim.id}` },
        body: JSON.stringify({ from: claim.from, to: [claim.to], subject: claim.subject, text: claim.text }), signal: AbortSignal.timeout(10000),
      });
      if (response.ok) { const body = await response.json(); if (typeof body.id === "string" && body.id) { outcome = "accepted"; providerId = body.id; } }
      else outcome = response.status === 429 || response.status >= 500 ? "retry" : "failed";
    } catch { /* Network ambiguity is retried with the same provider idempotency key and payload. */ }
    const { error: finishError } = await db.rpc("finish_search_alert_email", { p_id: claim.id, p_token: claim.token, p_outcome: outcome, p_provider_id: providerId });
    if (finishError) throw Error("Email result could not be recorded. The claim will be retried safely.");
    if (outcome === "accepted") result.emailAccepted++; else if (outcome === "retry") result.emailDeferred++; else result.emailFailed++;
  }
  return result;
}
