import BlogListClient from "@/components/blog/BlogListClient";

export const metadata = {
  title: "Blogs",
  description: "Read real estate insights and updates from BrickInfinity.",
};

export default function BlogsPage() {
  return (
    <section className="bg-[#F7F8FA] min-h-[60vh] py-16">
      <div className="max-w-5xl mx-auto px-6">
        <BlogListClient />
      </div>
    </section>
  );
}
