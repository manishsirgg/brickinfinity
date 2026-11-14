import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
export async function POST(req: Request) {
  if (req.headers.get("origin") !== new URL(req.url).origin) return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to save properties." }, { status: 401 });
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const { data, error } = await db.rpc(body?.action === "remove" ? "remove_buyer_favorite" : "toggle_buyer_favorite", { p_property_id: body?.propertyId });
  if (error) return NextResponse.json({ error: error.code === "P0001" ? error.message : "Saved properties could not be updated." }, { status: 400 });
  return NextResponse.json({ saved: body?.action === "remove" ? false : data });
}
