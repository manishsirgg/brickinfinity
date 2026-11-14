import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
export async function GET(req: Request) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to view your buyer dashboard." }, { status: 401 });
  const params = new URL(req.url).searchParams;
  const offset = Number(params.get("offset") || 0);
  const { data, error } = await db.rpc("get_buyer_activity", { p_category: params.get("category") || "viewed", p_offset: Number.isSafeInteger(offset) ? Math.max(0, offset) : 0 });
  if (error) return NextResponse.json({ error: "Buyer activity could not be loaded." }, { status: 500 });
  return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
}
export async function POST(req: Request) {
  if (req.headers.get("origin") !== new URL(req.url).origin) return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to manage your buyer dashboard." }, { status: 401 });
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  if (!body || !["view", "clear_views"].includes(body.action)) return NextResponse.json({ error: "Unknown activity action." }, { status: 400 });
  const { error } = body.action === "clear_views" ? await db.rpc("clear_buyer_views") : await db.rpc("record_buyer_property_view", { p_property_id: body.property_id });
  if (error) return NextResponse.json({ error: "Activity could not be updated." }, { status: 400 });
  return NextResponse.json({ success: true });
}
