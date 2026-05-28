export const dynamic = "force-dynamic"; export const revalidate = 0;
import { SellerCrmClientPage } from "@/components/seller-crm/SellerCrmClientPage";
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params; return <SellerCrmClientPage mode="contact-detail" id={id} title="Contact Detail" subtitle="Manage your seller CRM workflows with confidence."/>}
