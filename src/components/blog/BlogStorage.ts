export interface BlogPost {
  id: string;
  title: string;
  content: string;
  author: string;
  createdAt: string;
}

export const BLOG_STORAGE_KEY = "brickinfinity-blogs";

export function readBlogPosts(): BlogPost[] {
  if (typeof window === "undefined") return [];

  const raw = window.localStorage.getItem(BLOG_STORAGE_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as BlogPost[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeBlogPosts(posts: BlogPost[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(BLOG_STORAGE_KEY, JSON.stringify(posts));
}
