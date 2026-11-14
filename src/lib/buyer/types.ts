import type { VerificationFields } from "@/lib/owner-verification";
export type BuyerProperty = VerificationFields & {
  id: string; title?: string; slug?: string; price?: number | null; listing_type?: string | null; property_type?: string | null;
  views_count?: number | null; created_at?: string | null;
  built_up_area?: number | null; amenities?: string[] | null; furnishing_status?: string | null; security_deposit?: number | null;
  availability_status?: string; available_from?: string | null; availability_confirmed_at?: string | null;
  hourly_rate?: number | null; daily_rate?: number | null; monthly_rate?: number | null;
  cities?: { name?: string | null } | null; localities?: { name?: string | null } | null;
  property_images?: { image_url?: string | null; sort_order?: number | null }[] | null;
};
export type SavedSearch = { id: string; name: string; enabled: boolean; email_enabled: boolean; query: Record<string, string>; created_at: string };
