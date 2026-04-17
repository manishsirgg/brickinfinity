import { redirect } from "next/navigation"
import Link from "next/link"
import { getCurrentUser } from "@/lib/auth"
import { USER_ROLES } from "@/types/roles"

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {

  const user = await getCurrentUser()

  /* Not logged in */
  if (!user) {
    redirect("/login")
  }

  /* Not admin */
  if (user.role !== USER_ROLES.ADMIN) {
    redirect("/")
  }

  return (

    <div className="min-h-screen bg-gray-50">

      {/* ADMIN HEADER */}

      <div className="bg-white border-b">

        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">

          <Link href="/admin" className="font-semibold text-lg">
            BrickInfinity Admin
          </Link>

          <div className="flex gap-6 text-sm">

            <Link href="/admin/kyc" className="hover:underline">
              KYC
            </Link>

            <Link href="/admin/ownership" className="hover:underline">
              Ownership
            </Link>

            <Link href="/admin/properties" className="hover:underline">
              Listings
            </Link>

            <Link href="/dashboard/add-property" className="hover:underline">
              Create Property
            </Link>

            <Link href="/admin/reports" className="hover:underline">
              Reports
            </Link>

            <Link href="/admin/users" className="hover:underline">
              Users
            </Link>

            <Link href="/admin/blogs" className="hover:underline">
              Blogs
            </Link>

            <Link href="/admin/logs" className="hover:underline">
              Logs
            </Link>

            <Link href="/" className="hover:underline text-red-600">
              Exit Admin
            </Link>

          </div>

        </div>

      </div>

      {/* PAGE CONTENT */}

      <div>
        {children}
      </div>

    </div>
  )
}
