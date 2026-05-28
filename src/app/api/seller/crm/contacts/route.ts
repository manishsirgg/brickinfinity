import { NextRequest, NextResponse } from "next/server";
import { resolveSellerCrmContext } from "@/lib/seller-crm/auth";
import { getContactPropertyId } from "@/lib/seller-crm/property-link";

export async function GET(req: NextRequest) { try { const ctx = await resolveSellerCrmContext(); if (!ctx.ok) return NextResponse.json({ ok:false,error:ctx.error,details:ctx.details },{status:ctx.status}); const sp=req.nextUrl.searchParams; const q=sp.get("q")??""; const lifecycleStage=sp.get("lifecycle_stage"); const leadTemperature=sp.get("lead_temperature"); const source=sp.get("source"); const archived=sp.get("archived"); const sort=sp.get("sort") ?? "newest"; let query=ctx.supabase.from("seller_crm_contacts").select("*").eq("seller_id",ctx.sellerId);
if(q) query=query.or(`full_name.ilike.%${q}%,phone.ilike.%${q}%,whatsapp_number.ilike.%${q}%,email.ilike.%${q}%,city.ilike.%${q}%,locality.ilike.%${q}%`);
if(lifecycleStage) query=query.eq("lifecycle_stage", lifecycleStage);
if(leadTemperature) query=query.eq("lead_temperature", leadTemperature);
if(source) query=query.ilike("source", source);
if(archived==="true") query=query.eq("is_archived", true);
if(archived==="false") query=query.eq("is_archived", false);
if(sort==="updated") query=query.order("updated_at",{ascending:false}); else if(sort==="name") query=query.order("full_name",{ascending:true}); else query=query.order("created_at",{ascending:false});
const {data,error}=await query.limit(100); if(error) throw error;
const contacts = data ?? [];
const propertyIds = Array.from(new Set(contacts.map((c:any)=>getContactPropertyId(c)).filter(Boolean)));
const { data: properties } = propertyIds.length
  ? await ctx.supabase.from("properties").select("id,slug,title,property_type,listing_type,city,locality,price,monthly_rent,rent,seller_id").eq("seller_id", ctx.sellerId).in("id", propertyIds as string[])
  : { data: [] as any[] };
const propMap = new Map((properties ?? []).map((p:any)=>[p.id,p]));
const enriched = contacts.map((contact:any)=>({ ...contact, property_summary: propMap.get(getContactPropertyId(contact)) ?? null }));
return NextResponse.json({ok:true,data:enriched}); } catch(error){ console.error("[seller-crm/contacts]",error); return NextResponse.json({ok:false,error:"Unexpected error"},{status:500}); }}
export async function POST(req: NextRequest) { try { const ctx=await resolveSellerCrmContext(); if(!ctx.ok) return NextResponse.json({ok:false,error:ctx.error,details:ctx.details},{status:ctx.status}); const body=await req.json(); const { seller_id, created_by, updated_by, created_at, updated_at, id, ...safeBody } = body ?? {}; if(!safeBody.full_name?.trim()) return NextResponse.json({ok:false,error:"Contact name is required."},{status:400}); if (safeBody.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(safeBody.email).trim())) return NextResponse.json({ok:false,error:"Please enter a valid email address"},{status:400}); if(safeBody.budget_min && safeBody.budget_max && Number(safeBody.budget_min)>Number(safeBody.budget_max)) return NextResponse.json({ok:false,error:"Minimum budget cannot be greater than maximum budget."},{status:400}); const {data,error}=await ctx.supabase.from("seller_crm_contacts").insert({ ...safeBody, seller_id:ctx.sellerId,created_by:ctx.sellerId,updated_by:ctx.sellerId}).select("*").single(); if(error) return NextResponse.json({ok:false,error:error.message.includes("duplicate")?"This phone number or email already exists in your CRM.":error.message},{status:400}); await ctx.supabase.from("seller_crm_activities").insert({seller_id:ctx.sellerId,contact_id:data.id,activity_type:"lead_created",channel:"system",title:"Lead created"}); return NextResponse.json({ok:true,data}); } catch(error){ console.error("[seller-crm/contacts]",error); return NextResponse.json({ok:false,error:"Unexpected error"},{status:500}); }}
