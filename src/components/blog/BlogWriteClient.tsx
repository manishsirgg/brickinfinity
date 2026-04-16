"use client";

import { FormEvent, useState } from "react";
import { BlogPost, readBlogPosts, writeBlogPosts } from "./BlogStorage";

export default function BlogWriteClient() {
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [content, setContent] = useState("");
  const [message, setMessage] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!title.trim() || !author.trim() || !content.trim()) {
      setMessage("Please fill in title, author, and content.");
      return;
    }

    const posts = readBlogPosts();
    const newPost: BlogPost = {
      id: crypto.randomUUID(),
      title: title.trim(),
      author: author.trim(),
      content: content.trim(),
      createdAt: new Date().toISOString(),
    };

    writeBlogPosts([newPost, ...posts]);
    setTitle("");
    setAuthor("");
    setContent("");
    setMessage("Blog published successfully.");
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-3xl font-bold mb-6 text-[var(--color-dark)]">Write a Blog</h1>

      <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl bg-white border border-gray-100 p-6 shadow-sm">
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Blog title"
          className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:ring-2 focus:ring-red-200"
        />
        <input
          value={author}
          onChange={(event) => setAuthor(event.target.value)}
          placeholder="Author name"
          className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:ring-2 focus:ring-red-200"
        />
        <textarea
          value={content}
          onChange={(event) => setContent(event.target.value)}
          placeholder="Write your blog content..."
          rows={10}
          className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:ring-2 focus:ring-red-200"
        />

        <button
          type="submit"
          className="rounded-full bg-red-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-red-700 transition"
        >
          Publish
        </button>

        {message ? <p className="text-sm text-gray-600">{message}</p> : null}
      </form>
    </div>
  );
}
