import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabase.rpc("mark_all_notifications_read");

    if (error) throw error;

    return NextResponse.json({ success: true, updatedCount: typeof data === "number" ? data : 0 });
  } catch (error) {
    console.error("[notifications] mark-all-read failed", error);
    return NextResponse.json({ success: false, error: "Failed to mark all notifications as read" }, { status: 500 });
  }
}
