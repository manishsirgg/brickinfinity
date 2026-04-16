import BlogWriteClient from "@/components/blog/BlogWriteClient";

export const metadata = {
  title: "Write Blog",
  description: "Create and publish a blog post on BrickInfinity.",
};

export default function WriteBlogPage() {
  return (
    <section className="bg-[#F7F8FA] min-h-[60vh] py-16">
      <div className="max-w-5xl mx-auto px-6">
        <BlogWriteClient />
      </div>
    </section>
  );
}
