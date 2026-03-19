import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(req: Request) {

  const supabase = await createClient();

  const { propertyId } = await req.json();

  const { data: { session } } =
    await supabase.auth.getSession();

  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id;

  const { data } = await supabase
    .from("favorites")
    .select("id")
    .eq("user_id", userId)
    .eq("property_id", propertyId)
    .single();

  if (data) {

    await supabase
      .from("favorites")
      .delete()
      .eq("id", data.id);

    return NextResponse.json({ saved: false });

  }

  await supabase
    .from("favorites")
    .insert({
      user_id: userId,
      property_id: propertyId
    });

  return NextResponse.json({ saved: true });
}