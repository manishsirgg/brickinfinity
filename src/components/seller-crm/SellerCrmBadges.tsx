import { humanize } from "@/lib/seller-crm/format";

type Props = { value?: string | null; className?: string };
const base = "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border";

function badgeTone(map: Record<string, string>, value?: string | null) {
  return map[value ?? ""] ?? "bg-gray-100 text-gray-700 border-gray-200";
}

function Badge({ value, className, tones }: Props & { tones: Record<string, string> }) {
  return <span className={`${base} ${badgeTone(tones, value)} ${className ?? ""}`.trim()}>{humanize(value)}</span>;
}

export const SellerCrmStageBadge = (props: Props) => <Badge {...props} tones={{ closed_won: "bg-emerald-100 text-emerald-800 border-emerald-200", closed_lost: "bg-rose-100 text-rose-800 border-rose-200", negotiation: "bg-amber-100 text-amber-800 border-amber-200", converted: "bg-emerald-100 text-emerald-800 border-emerald-200", lost: "bg-rose-100 text-rose-800 border-rose-200" }} />;
export const SellerCrmTemperatureBadge = (props: Props) => <Badge {...props} tones={{ hot: "bg-rose-100 text-rose-800 border-rose-200", warm: "bg-amber-100 text-amber-800 border-amber-200", cold: "bg-sky-100 text-sky-800 border-sky-200" }} />;
export const SellerCrmStatusBadge = (props: Props) => <Badge {...props} tones={{ completed: "bg-emerald-100 text-emerald-800 border-emerald-200", cancelled: "bg-gray-100 text-gray-700 border-gray-200", missed: "bg-rose-100 text-rose-800 border-rose-200", scheduled: "bg-blue-100 text-blue-800 border-blue-200" }} />;
export const SellerCrmPriorityBadge = (props: Props) => <Badge {...props} tones={{ urgent: "bg-rose-100 text-rose-800 border-rose-200", high: "bg-orange-100 text-orange-800 border-orange-200", medium: "bg-amber-100 text-amber-800 border-amber-200", low: "bg-gray-100 text-gray-700 border-gray-200" }} />;
export const SellerCrmChannelBadge = (props: Props) => <Badge {...props} tones={{ whatsapp: "bg-green-100 text-green-800 border-green-200", email: "bg-indigo-100 text-indigo-800 border-indigo-200", call: "bg-blue-100 text-blue-800 border-blue-200", site_visit: "bg-purple-100 text-purple-800 border-purple-200" }} />;
export const SellerCrmActivityBadge = (props: Props) => <Badge {...props} tones={{ stage_change: "bg-purple-100 text-purple-800 border-purple-200", followup_created: "bg-blue-100 text-blue-800 border-blue-200", deal_created: "bg-indigo-100 text-indigo-800 border-indigo-200", converted: "bg-emerald-100 text-emerald-800 border-emerald-200", lost: "bg-rose-100 text-rose-800 border-rose-200" }} />;
