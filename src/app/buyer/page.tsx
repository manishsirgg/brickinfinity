import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import BuyerDashboard from "@/components/buyer/BuyerDashboard";
export const metadata = { title: "My property dashboard | BrickInfinity", robots: { index: false, follow: false } };
export default async function BuyerPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const params = await searchParams;
  const tab = ["saved", "viewed", "contacted", "visits", "searches"].includes(params.tab || "") ? params.tab as "saved" | "viewed" | "contacted" | "visits" | "searches" : "saved";
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user) redirect(`/login?redirect=${encodeURIComponent(`/buyer?tab=${tab}`)}`);
  return <BuyerDashboard key={tab} tab={tab} />;
}
