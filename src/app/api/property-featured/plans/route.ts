import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("property_featured_plans")
      .select(
        "id, plan_key, name, description, duration_days, amount_paise, compare_at_amount_paise, currency, badge, is_popular, is_best_value, benefits, sort_order"
      )
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    if (error) {
      console.error("[property-featured/plans]", error);
      return NextResponse.json(
        { ok: false, error: "Unable to fetch featured plans." },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, plans: data ?? [] }, { status: 200 });
  } catch (error) {
    console.error("[property-featured/plans]", error);
    return NextResponse.json(
      { ok: false, error: "Unable to fetch featured plans." },
      { status: 500 }
    );
  }
}
