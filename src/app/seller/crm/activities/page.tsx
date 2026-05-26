export const dynamic = "force-dynamic"; export const revalidate = 0;
import { SellerCrmClientPage } from "@/components/seller-crm/SellerCrmClientPage";
export default function Page(){return <SellerCrmClientPage title="CRM Activities" endpoint="/api/seller/crm/activities"/>}
