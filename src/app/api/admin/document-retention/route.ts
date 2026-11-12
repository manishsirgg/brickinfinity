import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { runDocumentRetention } from "@/lib/document-retention/worker";
export const runtime = "nodejs";
export const maxDuration = 60;
async function staff() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return null;
  const { data } = await db.from("users").select("role").eq("user_id", user.id).maybeSingle();
  return data?.role === "admin" ? user : null;
}
export async function GET(request: NextRequest) {
  if (!await staff()) return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  try {
    const db = createServiceClient();
    const offset = Math.max(0, Math.min(100000, Number(request.nextUrl.searchParams.get("offset")) || 0));
    const [policy, preview, files, events, inventory] = await Promise.all([
      db.from("document_retention_policy").select("*").eq("id", 1).single(),
      db.rpc("preview_document_retention", { p_limit: 50 }),
      db.from("document_retention_files").select("*").order("state", { ascending: false }).order("deleted_at", { ascending: false, nullsFirst: false }).limit(100),
      db.from("document_retention_events").select("*").order("created_at", { ascending: false }).limit(50),
      db.rpc("inventory_document_retention", { p_offset: Math.floor(offset) }),
    ]);
    const error = [policy, preview, files, events, inventory].find(item => item.error)?.error;
    if (error) throw new Error(error.message);
    return NextResponse.json({ policy: policy.data, candidates: preview.data, files: files.data, events: events.data, inventory: inventory.data, cronConfigured: Boolean(process.env.CRON_SECRET) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load retention data." }, { status: 500 }); }
}
export async function POST(request: NextRequest) {
  if (request.headers.get("origin") && request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const user = await staff();
  if (!user) return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  try {
    const input = await request.json();
    const db = createServiceClient();
    if (input.action === "run") return NextResponse.json(await runDocumentRetention(db, 20, user.id));
    if (input.action === "policy") {
      const days = input.reviewedDays;
      if (typeof input.enabled !== "boolean" || (days !== null && (!Number.isInteger(days) || days < 30 || days > 3650))) return NextResponse.json({ error: "Reviewed history: choose 30–3650 days or leave disabled." }, { status: 400 });
      const { error } = await db.rpc("configure_document_retention", { p_actor: user.id, p_enabled: input.enabled, p_reviewed_days: days });
      if (error) throw new Error(error.message);
    } else {
      if (!["hold", "unhold", "release", "cancel_release", "retry"].includes(input.action) || typeof input.bucket !== "string" || typeof input.path !== "string" || typeof input.reason !== "string" || !input.reason.trim()) return NextResponse.json({ error: "Choose an action, file and reason." }, { status: 400 });
      if (input.action === "release" && input.confirmClosed !== true) return NextResponse.json({ error: "Confirm the case is closed and the historical file is no longer needed." }, { status: 400 });
      const { error } = await db.rpc("manage_document_retention", { p_actor: user.id, p_bucket: input.bucket, p_path: input.path, p_action: input.action, p_reason: input.reason });
      if (error) throw new Error(error.message);
    }
    return NextResponse.json({ success: true });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Retention action failed." }, { status: 400 }); }
}
