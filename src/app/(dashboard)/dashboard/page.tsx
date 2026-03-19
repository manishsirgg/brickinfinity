import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardHome() {

  const supabase = await createClient();

  /* ================= SESSION ================= */

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect("/login");
  }

  /* ================= USER PROFILE ================= */

  const { data: userRecord, error } = await supabase
    .from("users")
    .select("full_name, role, kyc_status, seller_status")
    .eq("user_id", session.user.id)
    .maybeSingle();

  if (error || !userRecord) {
    redirect("/dashboard/profile");
  }

  const name = userRecord.full_name ?? "User";
  const role = userRecord.role ?? "buyer";
  const kycStatus = userRecord.kyc_status ?? "not_submitted";
  const sellerStatus = userRecord.seller_status ?? "basic";

  const isSeller = role === "seller";

  const isApprovedSeller =
    role === "seller" &&
    kycStatus === "approved" &&
    sellerStatus !== "suspended";

  const kycColor =
    kycStatus === "approved"
      ? "text-green-600"
      : kycStatus === "pending"
      ? "text-yellow-600"
      : "text-red-600";

  return (

    <div className="max-w-7xl mx-auto px-4 md:px-6 py-8 md:py-12 space-y-12">

      {/* HEADER */}

      <div className="space-y-2">

        <h1 className="text-2xl md:text-3xl font-bold text-gray-800">
          Welcome back, {name}
        </h1>

        <p className="text-sm md:text-base text-gray-500">
          Manage your account, listings and activity from your dashboard.
        </p>

      </div>


      {/* STATUS CARDS */}

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">

          <p className="text-xs uppercase tracking-wide text-gray-500">
            Account Role
          </p>

          <p className="text-lg font-semibold capitalize mt-2">
            {role}
          </p>

        </div>


        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">

          <p className="text-xs uppercase tracking-wide text-gray-500">
            KYC Status
          </p>

          <p className={`text-lg font-semibold mt-2 ${kycColor}`}>
            {kycStatus.replace("_", " ")}
          </p>

        </div>


        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">

          <p className="text-xs uppercase tracking-wide text-gray-500">
            Seller Tier
          </p>

          <p className="text-lg font-semibold capitalize mt-2">
            {sellerStatus}
          </p>

        </div>

      </div>


      {/* SELLER WARNING */}

      {isSeller && !isApprovedSeller && (

        <div className="bg-yellow-50 border border-yellow-200 p-6 rounded-2xl">

          <h3 className="font-semibold text-yellow-800">
            Complete KYC to unlock property publishing
          </h3>

          <p className="text-sm text-yellow-700 mt-2">
            Your seller account is not yet approved. Submit documents to activate full listing access.
          </p>

          <Link
            href="/dashboard/profile"
            className="inline-block mt-4 text-sm font-medium text-yellow-900 underline hover:opacity-80"
          >
            Complete KYC Now
          </Link>

        </div>

      )}


      {/* QUICK ACTIONS */}

      <div className="space-y-6">

        <h2 className="text-lg md:text-xl font-semibold text-gray-800">
          Quick Actions
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">

          {/* ADD PROPERTY */}

          {isSeller ? (

            isApprovedSeller ? (

              <Link
                href="/dashboard/add-property"
                className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition"
              >

                <h3 className="font-semibold text-gray-800">
                  Add New Property
                </h3>

                <p className="text-sm text-gray-500 mt-2">
                  Create and publish a new property listing.
                </p>

              </Link>

            ) : (

              <div className="bg-gray-100 p-6 rounded-2xl border border-gray-200 opacity-60 cursor-not-allowed">

                <h3 className="font-semibold text-gray-700">
                  Add New Property
                </h3>

                <p className="text-sm text-gray-500 mt-2">
                  KYC approval required.
                </p>

              </div>

            )

          ) : null}


          {/* MY LISTINGS */}

          {isSeller && (

            <Link
              href="/dashboard/my-listings"
              className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition"
            >

              <h3 className="font-semibold text-gray-800">
                My Listings
              </h3>

              <p className="text-sm text-gray-500 mt-2">
                View and manage your active properties.
              </p>

            </Link>

          )}


          {/* LEADS */}

          {isSeller && (

            <Link
              href="/dashboard/leads"
              className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition"
            >

              <h3 className="font-semibold text-gray-800">
                Leads
              </h3>

              <p className="text-sm text-gray-500 mt-2">
                Track buyer inquiries and engagement.
              </p>

            </Link>

          )}


          {/* ANALYTICS */}

          {isSeller && (

            <Link
              href="/dashboard/analytics"
              className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition"
            >

              <h3 className="font-semibold text-gray-800">
                Performance Analytics
              </h3>

              <p className="text-sm text-gray-500 mt-2">
                Track views, leads and listing performance.
              </p>

            </Link>

          )}


          {/* PROFILE */}

          <Link
            href="/profile"
            className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition"
          >

            <h3 className="font-semibold text-gray-800">
              Profile Settings
            </h3>

            <p className="text-sm text-gray-500 mt-2">
              Update your personal and account details.
            </p>

          </Link>

        </div>

      </div>

    </div>

  );

}