import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const rawLimit = Number(request.nextUrl.searchParams.get("limit") ?? DEFAULT_LIMIT);
    const limit = Number.isFinite(rawLimit)
      ? Math.min(MAX_LIMIT, Math.max(1, Math.floor(rawLimit)))
      : DEFAULT_LIMIT;

    const { data, error } = await supabase
      .from("notifications")
      .select("id,title,message,type,category,priority,is_read,link_url,action_label,entity_type,entity_id,metadata,created_at")
      .eq("is_dismissed", false)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw error;

    const notifications = (data ?? []).map((item) => ({
      ...item,
      metadata: (item.metadata && typeof item.metadata === "object") ? item.metadata as Record<string, unknown> : {},
    }));

    const unreadCount = notifications.reduce((count, item) => count + (item.is_read ? 0 : 1), 0);

    return NextResponse.json({ success: true, notifications, unreadCount });
  } catch (error) {
    console.error("[notifications] fetch failed", error);
    return NextResponse.json({ success: false, error: "Failed to fetch notifications" }, { status: 500 });
  }
}
