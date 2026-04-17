import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { USER_ROLES } from "@/types/roles";

export const metadata = {
  title: "Write Blog",
  description: "Create and publish a blog post on BrickInfinity.",
};

export default async function WriteBlogPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login?next=/admin/blogs");
  }

  if (user.role !== USER_ROLES.ADMIN) {
    redirect("/blogs");
  }

  redirect("/admin/blogs");
}
