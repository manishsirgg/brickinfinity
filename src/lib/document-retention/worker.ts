import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

type Claim = { bucket_id: string; path: string; token: string; reason: string; sha256: string | null; object_missing?: boolean };
/** Two-phase cleanup: SQL freezes/rechecks references; Storage API removes bytes;
 * SQL confirms absence and retains the audit/tombstone. Retries are idempotent. */
export async function runDocumentRetention(db: SupabaseClient, limit = 20, actor: string | null = null) {
  const { data, error } = await db.rpc("claim_document_retention", { p_limit: limit, p_actor: actor });
  if (error) throw new Error(error.message);
  const claims = (data || []) as Claim[];
  let deleted = 0, attempted = 0;
  const failures: { bucket: string; path: string; error: string }[] = [];
  const started = Date.now();
  for (const claim of claims) {
    if (Date.now() - started > 40_000) break; // Unprocessed leases can be retried.
    attempted++;
    const args = { p_bucket: claim.bucket_id, p_path: claim.path, p_token: claim.token };
    try {
      if (claim.object_missing && claim.reason === "reviewed_history_expired" && !claim.sha256) throw new Error("Reviewed evidence is missing without an audit checksum. Manual investigation is required.");
      if (claim.reason === "reviewed_history_expired" && !claim.sha256) {
        const { data: file, error: downloadError } = await db.storage.from(claim.bucket_id).download(claim.path);
        if (downloadError || !file) throw new Error("Could not read reviewed evidence for its audit checksum. File was not deleted.");
        const digest = createHash("sha256").update(Buffer.from(await file.arrayBuffer())).digest("hex");
        const prepared = await db.rpc("finish_document_retention", { ...args, p_prepare: true, p_sha256: digest });
        if (prepared.error) throw new Error(prepared.error.message);
      }
      if (!claim.object_missing) {
        const removed = await db.storage.from(claim.bucket_id).remove([claim.path]);
        if (removed.error) throw new Error(removed.error.message);
      }
      const finished = await db.rpc("finish_document_retention", args);
      if (finished.error) throw new Error(finished.error.message);
      deleted++;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Cleanup failed";
      failures.push({ bucket: claim.bucket_id, path: claim.path, error: message });
      const recorded = await db.rpc("finish_document_retention", { ...args, p_error: message });
      if (recorded.error) failures.push({ bucket: claim.bucket_id, path: claim.path, error: "Could not record failure; the cleanup lease remains available for retry." });
    }
  }
  return { claimed: claims.length, deleted, failures, deferred: claims.length - attempted };
}
