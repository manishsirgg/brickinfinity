import { formatDateTime, humanize } from "@/lib/seller-crm/format";
import { SellerCrmActivityBadge, SellerCrmChannelBadge } from "./SellerCrmBadges";

type Activity = { id: string; title: string; body?: string | null; activity_type?: string | null; channel?: string | null; created_at?: string | null; old_value?: string | null; new_value?: string | null };

export function SellerCrmTimeline({ items }: { items?: Activity[] | null }) {
  if (!items?.length) return <div className="rounded-xl border bg-white p-4 text-sm text-gray-600">No activity found.</div>;
  return <ol className="space-y-4">{items.map((a) => <li key={a.id} className="relative pl-6"><span className="absolute left-0 top-2 size-2 rounded-full bg-blue-500" /><div className="rounded-xl border bg-white p-4 space-y-2"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{a.title}</p><SellerCrmActivityBadge value={a.activity_type} /><SellerCrmChannelBadge value={a.channel} /></div>{a.body ? <p className="text-sm text-gray-700">{a.body}</p> : null}{a.old_value && a.new_value ? <p className="text-xs text-gray-600">{humanize(a.old_value)} → {humanize(a.new_value)}</p> : null}<p className="text-xs text-gray-500">{formatDateTime(a.created_at)}</p></div></li>)}</ol>;
}
