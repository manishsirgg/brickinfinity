import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    if (!id) {
      return NextResponse.json({ success: false, error: "Notification id is required" }, { status: 400 });
    }

    const { data, error } = await supabase.rpc("mark_notification_read", {
      p_notification_id: id,
    });

    if (error) throw error;

    return NextResponse.json({ success: true, updated: Boolean(data) });
  } catch (error) {
    console.error("[notifications] mark-read failed", error);
    return NextResponse.json({ success: false, error: "Failed to mark notification as read" }, { status: 500 });
  }
}
