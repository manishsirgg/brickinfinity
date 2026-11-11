import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { sellerDashboardAccess } from "@/lib/seller-dashboard-access";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {

  const user = await getCurrentUser().catch(() => null);

  /* NOT LOGGED IN */

  if (!user) {
    redirect("/login");
  }

  const access = sellerDashboardAccess(user);
  if (!access.allowed) redirect(access.href);

  return <>{children}</>;

}
