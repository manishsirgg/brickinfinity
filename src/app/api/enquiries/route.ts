import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to view enquiries." }, { status: 401 });
  const url = new URL(req.url);
  const offset = Number(url.searchParams.get("offset") || 0);
  const { data, error } = await client.rpc("list_property_enquiries", {
    p_seller: url.searchParams.get("view") === "seller",
    p_offset: Number.isSafeInteger(offset) && offset >= 0 ? offset : 0,
  });
  if (error) return NextResponse.json({ error: "Unable to load enquiries. Please try again." }, { status: 500 });
  return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(req: Request) {
  if (req.headers.get("origin") !== new URL(req.url).origin) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to manage enquiries." }, { status: 401 });
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const { error } = body.action === "contact_lead"
    ? await client.rpc("mark_property_lead_contacted", { p_lead_id: body.id })
    : await client.rpc("update_property_enquiry", {
      p_id: body.id, p_action: body.action, p_note: body.note || "", p_visit_at: body.visit_at || null,
    });
  if (error) return NextResponse.json({ error: error.code === "P0001" ? error.message : "Unable to update this enquiry." }, { status: 400 });
  return NextResponse.json({ success: true });
}
