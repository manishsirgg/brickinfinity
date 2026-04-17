import BlogWriteClient from "@/components/blog/BlogWriteClient";

export const metadata = {
  title: "Admin Blog Editor",
  description: "Create and publish blog posts from the BrickInfinity admin panel.",
};

export default function AdminBlogsPage() {
  return (
    <section className="max-w-5xl mx-auto p-10">
      <div className="mb-5">
        <p className="text-xs font-semibold tracking-wide uppercase text-red-600">Admin only</p>
        <h1 className="text-2xl font-semibold">Blog Publishing Console</h1>
        <p className="text-sm text-gray-500 mt-1">
          Only administrators can create, edit, and publish blog content.
        </p>
      </div>
      <BlogWriteClient />
    </section>
  );
}
