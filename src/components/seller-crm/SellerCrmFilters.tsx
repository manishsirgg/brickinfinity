"use client";

type Opt = { label: string; value: string };
type Props = { value?: string; onChange: (v: string) => void; options: Opt[]; allLabel?: string };

function BaseFilter({ value = "", onChange, options, allLabel = "All" }: Props) {
  return <select value={value} onChange={(e) => onChange(e.target.value)} className="border rounded-lg px-3 py-2 text-sm bg-white"><option value="">{allLabel}</option>{options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>;
}

export const SellerCrmContactFilters = BaseFilter;
export const SellerCrmDealFilters = BaseFilter;
export const SellerCrmFollowupFilters = BaseFilter;
export const SellerCrmActivityFilters = BaseFilter;
