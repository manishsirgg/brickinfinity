import PropertyViews from "@/components/property/PropertyViews";
import LocationBreadcrumb from "@/components/property/LocationBreadcrumb";
import PropertyDescription from "@/components/property/PropertyDescription";
import { createClient } from "@/lib/supabase/server";
import { getCoverImage } from "@/lib/property-images";
import { createServiceClient } from "@/lib/supabase/service";
import { notFound, redirect } from "next/navigation";
import { Metadata } from "next";

import PropertyGallery from "@/components/property/PropertyGallery";
import StickyContactPanel from "@/components/property/StickyContactPanel";
import SavePropertyButton from "@/components/property/SavePropertyButton";
import ShareButtons from "@/components/property/ShareButtons";

const baseUrl = "https://brickinfinity.com";

/* ================= METADATA ================= */

export async function generateMetadata(
{ params }: { params: Promise<{ id:string; slug:string }> }
): Promise<Metadata>{

const { id } = await params;
const supabase = createServiceClient();

const { data: property } = await supabase
  .from("properties")
  .select(`
    title,
    description,
    meta_title,
    meta_description,
    slug,
    price,
    property_type,
    listing_type,
    bedrooms,
    cities(id,name, states(id,name)),
    localities(id,name),
    property_images(image_url,sort_order)
  `)
  .eq("id", id)
  .eq("status", "active")
  .eq("verification_status", "approved")
  .is("deleted_at", null)
  .maybeSingle();

if (!property) {
  return { title: "Property | BrickInfinity" };
}

/* SAFE RELATION RESOLVE */

/* ===== SAFE RELATION RESOLVE ===== */

let city = "";
let state = "";
let locality = "";

/* CITY + STATE */

const cityData = Array.isArray(property.cities)
  ? property.cities[0]
  : property.cities;

if (cityData) {
  city = cityData.name || "";

  const stateData = Array.isArray(cityData.states)
    ? cityData.states[0]
    : cityData.states;

  if (stateData) {
    state = stateData.name || "";
  }
}

/* LOCALITY */

const localityData = Array.isArray(property.localities)
  ? property.localities[0]
  : property.localities;

if (localityData) {
  locality = localityData.name || "";
}

/* POWER SEO TITLE */

const seoTitle =
property.meta_title ||
`${property.bedrooms || ""} BHK ${property.property_type} for ${property.listing_type} in ${locality || city || ""} ${city || ""} ${state || ""} | BrickInfinity`;

const orderedMetadataImages = (property.property_images || []).slice().sort((a:any,b:any)=>(a.sort_order ?? 0)-(b.sort_order ?? 0));

const image =
orderedMetadataImages?.[0]?.image_url ||
`${baseUrl}/og-default.jpg`;

return{
title: seoTitle,
description:
property.meta_description ||
property.description?.slice(0,160),

alternates:{
canonical:`${baseUrl}/property/${id}/${property.slug}`
},

openGraph:{
title: seoTitle,
description: property.description?.slice(0,160),
url:`${baseUrl}/property/${id}/${property.slug}`,
images:[image]
}
};
}

/* ================= PAGE ================= */

export default async function PropertyPage(
{ params }: { params: Promise<{ id:string; slug:string }> }
){

const { id, slug } = await params;
const supabase = createServiceClient();
const viewerSupabase = await createClient();

const { data:property,error } = await supabase
.from("properties")
.select(`
*,
property_images(id,image_url,sort_order),
property_videos(video_url),
cities(id,name, states(id,name)),
localities(id,name)
`)
.eq("id",id)
.eq("status", "active")
.eq("verification_status", "approved")
.is("deleted_at", null)
.maybeSingle();

if(error || !property) notFound();

/* SAFE RELATIONS */

const cityData = Array.isArray(property.cities) ? property.cities[0] : property.cities;
const stateData = Array.isArray(cityData?.states) ? cityData.states[0] : cityData?.states;
const localityData = Array.isArray(property.localities) ? property.localities[0] : property.localities;
const city = cityData?.name;
const state = stateData?.name;
const locality = localityData?.name;

/* ================= VISIBILITY GUARD ================= */

if (property.deleted_at !== null) notFound();

const { data:{ user } } = await viewerSupabase.auth.getUser();

const isSellerPreview = false;

/* canonical redirect */

if(property.slug !== slug){
redirect(`/property/${property.id}/${property.slug}`);
}

/* view counter */

if (property.deleted_at === null) {
  const { error: viewError } = await supabase.rpc("increment_property_views", {
    property_id: property.id
  });
  if (viewError) console.error("Property view increment failed:", viewError);
  else {
    const { data: viewData } = await supabase.from("properties").select("views_count").eq("id", property.id).maybeSingle();
    if (viewData) property.views_count = viewData.views_count;
  }
}

/* seller */

const { data:seller } = await supabase.rpc(
"get_public_seller",
{ seller_uuid: property.seller_id }
);

const sellerData =
seller?.[0] || { full_name:"Property Owner" };

/* favorites */

let favorite = null;

if(user){
const { data:fav } = await viewerSupabase
.from("favorites")
.select("id")
.eq("property_id",property.id)
.eq("user_id",user.id)
.maybeSingle();

favorite = fav;
}

/* similar properties */

let similarProperties:any = [];

const { data:similar } = await supabase
.from("properties")
.select(`
id,
slug,
price,
property_type,
property_images(image_url,sort_order)
`)
.eq("city_id",property.city_id)
.eq("listing_type",property.listing_type)
.eq("status", "active")
.eq("verification_status", "approved")
.is("deleted_at", null)
.neq("id",property.id)
.limit(4);

if(similar) similarProperties = similar;

const rentAmount = property.listing_type === "Rent"
  ? Number(property.hourly_rate || property.daily_rate || property.monthly_rate || property.price || 0)
  : Number(property.price || 0);

const rentUnit = property.listing_type === "Rent"
  ? property.hourly_rate
    ? "/ hour"
    : property.daily_rate
      ? "/ day"
      : "/ month"
  : "";

const formattedPrice =
new Intl.NumberFormat("en-IN")
.format(rentAmount || 0);


/* MAP SAFE */

const mapQuery =
encodeURIComponent(`${locality} ${city} ${state}`);

property.property_images = (property.property_images || []).slice().sort((a:any,b:any)=>(a.sort_order ?? 0)-(b.sort_order ?? 0));

/* ================= UI ================= */

return(

<main className="container-custom min-w-0 py-8 sm:py-12 lg:py-16">

{isSellerPreview && (
<div className="mb-6 bg-yellow-50 border border-yellow-300 text-yellow-800 px-4 py-3 rounded-md text-sm">
This property is not yet live. Only you can see this preview.
</div>
)}

<LocationBreadcrumb state={stateData} city={cityData} locality={localityData} />

<div className="card-soft p-4 mb-8 flex flex-wrap items-center justify-between gap-3">
<div className="text-sm">
🔥 This property is getting attention. Contact the seller before it's gone.
</div>
<a href="#contact" className="btn-primary shrink-0 text-sm">
Contact Seller
</a>
</div>

<div className="grid min-w-0 grid-cols-1 gap-8 lg:grid-cols-3 lg:gap-12">

<div className="min-w-0 space-y-8 lg:col-span-2 lg:space-y-12">

<section className="space-y-3">

<h1 className="min-w-0 break-words text-2xl sm:text-3xl md:text-4xl font-semibold">
{property.title ||
`${property.property_type} for ${property.listing_type} in ${city}`}
</h1>

<p className="text-muted">
{locality}, {city}
</p>

<PropertyViews count={property.views_count} />

<div className="flex flex-wrap items-center gap-3 sm:gap-6">

<p className="min-w-0 break-words text-2xl sm:text-3xl font-bold text-primary">
₹ {formattedPrice}
{property.listing_type==="Rent" && ` ${rentUnit}`}
</p>

<SavePropertyButton
propertyId={property.id}
initialSaved={!!favorite}
/>

</div>

<ShareButtons
url={`${baseUrl}/property/${property.id}/${property.slug}`}
title={property.title}
/>

</section>

<PropertyGallery
images={property.property_images || []}
videos={property.property_videos || []}
title={property.title}
/>

<section className="card-soft min-w-0 p-4 sm:p-6">
<h2 className="text-xl font-semibold mb-6">Property Highlights</h2>
<div className="grid min-w-0 grid-cols-2 gap-4 text-sm md:grid-cols-4 md:gap-6">

{property.bedrooms !== null && (
<div>
<div className="text-muted text-xs">Bedrooms</div>
<div className="font-medium">{property.bedrooms} BHK</div>
</div>
)}

{property.built_up_area !== null && (
<div>
<div className="text-muted text-xs">Built Up Area</div>
<div className="font-medium">{property.built_up_area} sqft</div>
</div>
)}

{property.carpet_area !== null && (
<div>
<div className="text-muted text-xs">Carpet Area</div>
<div className="font-medium">{property.carpet_area} sqft</div>
</div>
)}

{property.parking !== null && (
<div>
<div className="text-muted text-xs">Parking</div>
<div className="font-medium">{property.parking}</div>
</div>
)}

</div>
</section>



<section className="card-soft min-w-0 p-4 sm:p-6">
<h2 className="text-xl font-semibold mb-6">Property Details</h2>

<div className="grid md:grid-cols-3 gap-6 text-sm">

{property.bathrooms !== null && (
<div>Bathrooms: {property.bathrooms}</div>
)}

{property.furnishing_status && (
<div>Furnishing: {property.furnishing_status}</div>
)}

{property.parking !== null && (
<div>Parking: {property.parking}</div>
)}

{property.built_up_area !== null && (
<div>Built-up Area: {property.built_up_area} sqft</div>
)}

{property.carpet_area !== null && (
<div>Carpet Area: {property.carpet_area} sqft</div>
)}

{property.gated_security && (
<div>Security: Gated Community</div>
)}

</div>
</section>

<section className="card-soft min-w-0 p-4 sm:p-6">
<h2 className="text-xl font-semibold mb-4">Description</h2>
<PropertyDescription text={property.description} />
</section>

{property.amenities?.length > 0 && (
<section className="card-soft min-w-0 p-4 sm:p-6">
<h2 className="text-xl font-semibold mb-6">Amenities</h2>
<div className="flex flex-wrap gap-2">
{property.amenities.map((a:string)=>(
<div key={a} className="chip max-w-full break-words">{a}</div>
))}
</div>
</section>
)}

<section className="card-soft min-w-0 p-4 sm:p-6">
<h2 className="text-xl font-semibold mb-6">Location</h2>

<iframe
src={`https://maps.google.com/maps?q=${mapQuery}&output=embed`}
width="100%"
height="350"
loading="lazy"
title="Property location map"
className="block max-w-full rounded-lg border"
/>

</section>

{similarProperties.length > 0 && (
<section>

<h2 className="text-xl font-semibold mb-6">
More properties in {locality}
</h2>

<div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">

{similarProperties.map((p:any)=>{

const image =
getCoverImage(p.property_images);

const price =
new Intl.NumberFormat("en-IN").format(p.price);

return(
<a
key={p.id}
href={`/property/${p.id}/${p.slug}`}
className="card-soft overflow-hidden hover:shadow-medium transition"
>

<img src={image} className="aspect-square w-full object-cover"/>

<div className="p-4 space-y-1">
<div className="font-medium">{p.property_type}</div>
<div className="text-primary font-semibold">₹ {price}</div>
</div>

</a>
);
})}

</div>

</section>
)}

</div>

<div id="contact" className="min-w-0 space-y-6 lg:sticky lg:top-24 h-fit">

<div className="card-soft min-w-0 p-4 sm:p-6">

<div className="font-semibold text-lg mb-3">
Seller
</div>

<div className="flex items-center gap-3">

<div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center">
{sellerData.full_name?.charAt(0)}
</div>

<div>

<div className="min-w-0 break-words font-medium">
{sellerData.full_name}
</div>

<div className="text-xs text-green-600">
✔ Verified Seller
</div>

</div>

</div>

</div>

<StickyContactPanel
propertyId={property.id}
sellerId={property.seller_id}
sellerName={sellerData.full_name}
/>

</div>

</div>

</main>

);
}
