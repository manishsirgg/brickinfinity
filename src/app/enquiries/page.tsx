import EnquiryInbox from "@/components/enquiries/EnquiryInbox";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export const metadata = { title: "Enquiries & visits | BrickInfinity", robots: { index: false, follow: false } };
export default async function Page({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  const params = await searchParams;
  if (!user) redirect(`/login?redirect=${encodeURIComponent(params.view === "seller" ? "/enquiries?view=seller" : "/enquiries")}`);
  return <EnquiryInbox key={params.view || "buyer"} seller={params.view === "seller"} />;
}
