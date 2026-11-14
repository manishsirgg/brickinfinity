import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { runSearchAlerts } from "@/lib/buyer/email-alerts";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "Cron authentication is not configured." }, { status: 503 });
  const actual = Buffer.from(req.headers.get("authorization") || ""), expected = Buffer.from(`Bearer ${secret}`);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try { return NextResponse.json(await runSearchAlerts(createServiceClient()), { headers: { "Cache-Control": "no-store" } }); }
  catch { return NextResponse.json({ error: "Search alerts could not be processed. Check the alert queue." }, { status: 500 }); }
}
