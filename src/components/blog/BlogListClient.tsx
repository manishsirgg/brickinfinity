"use client";

import { useEffect, useState } from "react";
import { BlogPost, readBlogPosts } from "./BlogStorage";

export default function BlogListClient() {
  const [posts, setPosts] = useState<BlogPost[]>([]);

  useEffect(() => {
    setPosts(readBlogPosts());
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-[var(--color-dark)]">Blogs</h1>
      </div>

      {posts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center text-gray-500">
          No blogs yet. Be the first to publish one.
        </div>
      ) : (
        <div className="grid gap-4">
          {posts
            .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
            .map((post) => (
              <article key={post.id} className="rounded-2xl bg-white p-6 shadow-sm border border-gray-100">
                <h2 className="text-xl font-semibold mb-2">{post.title}</h2>
                <p className="text-xs text-gray-500 mb-4">
                  By {post.author} · {new Date(post.createdAt).toLocaleDateString()}
                </p>
                <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">
                  {post.content}
                </p>
              </article>
            ))}
        </div>
      )}
    </div>
  );
}
