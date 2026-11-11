import PropertiesSearchPage from "@/app/properties/page";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Rent Properties | BrickInfinity" };

type Props = { searchParams?: Record<string, string | string[] | undefined> | Promise<Record<string, string | string[] | undefined>> };
export default async function Page({ searchParams = {} }: Props) {
  return PropertiesSearchPage({ searchParams: { ...await searchParams, listing_type: "Rent" } });
}
