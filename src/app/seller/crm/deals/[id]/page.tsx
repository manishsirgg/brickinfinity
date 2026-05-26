export const dynamic = "force-dynamic"; export const revalidate = 0;
import { SellerCrmClientPage } from "@/components/seller-crm/SellerCrmClientPage";
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params; return <SellerCrmClientPage title="Deal Detail" endpoint={`/api/seller/crm/deals/${id}`}/>}
