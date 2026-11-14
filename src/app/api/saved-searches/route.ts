import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { compileSavedSearch } from "@/lib/buyer/search";
import { searchEmailConfigured } from "@/lib/buyer/email-alerts";
export async function GET() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to view saved searches." }, { status: 401 });
  const { data, error } = await db.rpc("get_buyer_searches");
  if (error) return NextResponse.json({ error: "Saved searches could not be loaded." }, { status: 500 });
  return NextResponse.json({ ...data, emailConfigured: searchEmailConfigured() }, { headers: { "Cache-Control": "private, no-store" } });
}
export async function POST(req: Request) {
  if (req.headers.get("origin") !== new URL(req.url).origin) return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to save searches." }, { status: 401 });
  try {
    const body = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw Error("Invalid saved search request.");
    if (body.action === "save") {
      if (!body.filters || typeof body.filters !== "object" || Array.isArray(body.filters)) throw Error("Apply valid filters first.");
      if (body.email === true && !searchEmailConfigured()) throw Error("Email alerts are not configured yet. You can save this search for in-app alerts.");
      const { criteria, values, summary } = await compileSavedSearch(db, body.filters);
      const name = typeof body.name === "string" && body.name.trim() ? body.name.trim().slice(0, 200) : summary;
      const { data, error } = await db.rpc("save_buyer_search", { p_name: name, p_criteria: criteria, p_query: values, p_email: body.email === true });
      if (error) throw Error(error.code === "P0001" ? error.message : "Search could not be saved.");
      return NextResponse.json({ success: true, id: data });
    }
    if (!["pause", "resume", "email_on", "email_off", "delete"].includes(body.action)) throw Error("Unknown saved search action.");
    if (body.action === "email_on" && !searchEmailConfigured()) throw Error("Email alerts are not configured yet.");
    const { error } = await db.rpc("manage_buyer_search", { p_id: body.id, p_action: body.action });
    if (error) throw Error(error.code === "P0001" ? error.message : "Search could not be updated.");
    return NextResponse.json({ success: true });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid request." }, { status: 400 }); }
}
