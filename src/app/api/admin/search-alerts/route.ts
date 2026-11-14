import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { runSearchAlerts, searchEmailConfigured } from "@/lib/buyer/email-alerts";
export const maxDuration = 60;
async function isAdmin() {
  const db = await createClient(); const { data: { user } } = await db.auth.getUser();
  if (!user) return false;
  const { data } = await db.from("users").select("role").eq("user_id", user.id).maybeSingle();
  return data?.role === "admin";
}
export async function GET() {
  if (!await isAdmin()) return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  try {
    const { data, error } = await createServiceClient().rpc("search_alert_operations");
    if (error) throw error;
    return NextResponse.json({ ...data, emailConfigured: searchEmailConfigured(), cronConfigured: Boolean(process.env.CRON_SECRET) }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "Search alert status could not be loaded." }, { status: 500 }); }
}
export async function POST(req: Request) {
  if (req.headers.get("origin") !== new URL(req.url).origin) return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
  if (!await isAdmin()) return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  try { return NextResponse.json(await runSearchAlerts(createServiceClient())); }
  catch { return NextResponse.json({ error: "Search alerts could not be processed. Check the queue and email configuration." }, { status: 500 }); }
}
