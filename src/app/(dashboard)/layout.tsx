import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { USER_ROLES } from "@/types/roles";

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

  /* ROLE CHECK */

  if (user.role !== USER_ROLES.SELLER) {
    redirect("/profile?upgrade=seller");
  }

  /* KYC STATUS */

  if (user.kycStatus === "pending") {
    redirect("/profile?kyc=pending");
  }

  if (user.kycStatus === "rejected") {
    redirect("/profile?kyc=rejected");
  }

  if (user.kycStatus !== "approved") {
    redirect("/profile?upgrade=kyc");
  }

  return <>{children}</>;

}