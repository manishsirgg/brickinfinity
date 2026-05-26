export const dynamic = "force-dynamic";
export const revalidate = 0;
import { SellerCrmClientPage } from "@/components/seller-crm/SellerCrmClientPage";
export default function Page(){return <SellerCrmClientPage title="Seller CRM" subtitle="Manage your leads, buyers, tenants, follow-ups, site visits, and property deals." endpoint="/api/seller/crm/summary"/>}
