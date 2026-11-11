import { Eye } from "lucide-react";

export default function PropertyViews({ count }: { count?: number | null }) {
  const views = Number.isFinite(count) ? Math.max(0, Math.floor(count!)) : 0;
  return (
    <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600"
      title="Total recorded property views. Repeat visits may be included.">
      <Eye size={14} aria-hidden="true" />
      <span>{views.toLocaleString("en-IN")} {views === 1 ? "view" : "views"}</span>
    </span>
  );
}
