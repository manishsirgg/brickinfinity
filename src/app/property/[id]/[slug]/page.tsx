import { createClient } from "@/lib/supabase/server";
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
const supabase = await createClient();

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
    cities(name, states(name)),
    localities(name),
    property_images(image_url)
  `)
  .eq("id", id)
  .eq("status","active")
  .eq("ownership_verified", true)
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

const image =
property.property_images?.[0]?.image_url ||
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
const supabase = await createClient();

const { data:property,error } = await supabase
.from("properties")
.select(`
*,
property_images(id,image_url),
property_videos(video_url),
cities(name, states(name)),
localities(name)
`)
.eq("id",id)
.maybeSingle();

if(error || !property) notFound();

/* SAFE RELATIONS */

const city =
Array.isArray(property.cities)
  ? property.cities[0]?.name
  : property.cities?.name;

const state =
Array.isArray(property.cities)
  ? property.cities[0]?.states?.name
  : property.cities?.states?.name;

const locality =
Array.isArray(property.localities)
  ? property.localities[0]?.name
  : property.localities?.name;

/* ================= VISIBILITY GUARD ================= */

const { data:{ user } } = await supabase.auth.getUser();
const currentUser = user ?? null;

let canView = false;

if (currentUser) {
  const { data: userProfile } = await supabase
    .from("users")
    .select("id")
    .eq("user_id", currentUser.id)
    .maybeSingle();

  if (
    userProfile?.id === property.seller_id &&
    property.deleted_at === null
  ) {
    canView = true;
  }
}

if (currentUser) {
  const { data: userRow } = await supabase
    .from("users")
    .select("role")
    .eq("user_id", currentUser.id)
    .maybeSingle();

  if (userRow?.role === "admin") {
    canView = true;
  }
}

if (
  property.status === "active" &&
  property.ownership_verified === true &&
  property.deleted_at === null
) {
  canView = true;
}

if (!canView) notFound();

const isSellerPreview =
  currentUser &&
  property.seller_id &&
  property.deleted_at === null &&
  (
    property.status !== "active" ||
    property.ownership_verified !== true
  );

/* canonical redirect */

if(property.slug !== slug){
redirect(`/property/${property.id}/${property.slug}`);
}

/* view counter */

if (
  property.status === "active" &&
  property.ownership_verified === true &&
  property.deleted_at === null
) {
  void supabase.rpc("increment_property_views", {
    property_id: property.id
  });
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
const { data:fav } = await supabase
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
property_images(image_url)
`)
.eq("city_id",property.city_id)
.eq("listing_type",property.listing_type)
.eq("status","active")
.eq("ownership_verified", true)
.is("deleted_at", null)
.neq("id",property.id)
.limit(4);

if(similar) similarProperties = similar;

const formattedPrice =
new Intl.NumberFormat("en-IN")
.format(property.price || 0);

/* MAP SAFE */

const mapQuery =
encodeURIComponent(`${locality} ${city} ${state}`);

/* ================= UI (UNCHANGED) ================= */

return(

<main className="container-custom py-16">

{isSellerPreview && (
<div className="mb-6 bg-yellow-50 border border-yellow-300 text-yellow-800 px-4 py-3 rounded-md text-sm">
This property is not yet live. Only you can see this preview.
</div>
)}

<div className="text-sm text-muted mb-6">

<a href="/" className="hover:underline">Home</a>
<span className="mx-2">›</span>

{state && (
<>
<a href={`/buy?state=${encodeURIComponent(state)}`} className="hover:underline">
{state}
</a>
<span className="mx-2">›</span>
</>
)}

{city && (
<>
<a href={`/buy?city=${encodeURIComponent(city)}`} className="hover:underline">
{city}
</a>
<span className="mx-2">›</span>
</>
)}

<span>{locality}</span>

</div>

<div className="card-soft p-4 mb-8 flex items-center justify-between">
<div className="text-sm">
🔥 This property is getting attention. Contact the seller before it's gone.
</div>
<a href="#contact" className="bg-primary text-white px-4 py-2 rounded-md text-sm">
Contact Seller
</a>
</div>

<div className="grid lg:grid-cols-3 gap-12">

<div className="lg:col-span-2 space-y-12">

<section className="space-y-3">

<h1 className="text-3xl md:text-4xl font-semibold">
{property.title ||
`${property.property_type} for ${property.listing_type} in ${city}`}
</h1>

<p className="text-muted">
{locality}, {city}
</p>

<div className="flex items-center gap-6">

<p className="text-3xl font-bold text-primary">
₹ {formattedPrice}
{property.listing_type==="Rent" && " / month"}
</p>

<SavePropertyButton
propertyId={property.id}
initialSaved={!!favorite}
/>

</div>

<ShareButtons
url={`${baseUrl}/property/${property.id}/${property.slug}`}
/>

</section>

<PropertyGallery
images={
property.property_images?.length
? property.property_images
: [{ image_url:"/placeholder.jpg"}]
}
/>

<section className="card-soft p-6">
<h2 className="text-xl font-semibold mb-6">Property Highlights</h2>
<div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-sm">

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

{property.property_videos?.[0] && (
<section className="card-soft p-4">
<video controls className="rounded-lg w-full max-h-[500px]">
<source src={property.property_videos[0].video_url} type="video/mp4"/>
</video>
</section>
)}

<section className="card-soft p-6">
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

<section className="card-soft p-6">
<h2 className="text-xl font-semibold mb-4">Description</h2>
<p className="text-muted leading-relaxed">
{property.description}
</p>
</section>

{property.amenities?.length > 0 && (
<section className="card-soft p-6">
<h2 className="text-xl font-semibold mb-6">Amenities</h2>
<div className="flex flex-wrap gap-2">
{property.amenities.map((a:string)=>(
<div key={a} className="chip">{a}</div>
))}
</div>
</section>
)}

<section className="card-soft p-6">
<h2 className="text-xl font-semibold mb-6">Location</h2>

<iframe
src={`https://maps.google.com/maps?q=${mapQuery}&output=embed`}
width="100%"
height="350"
loading="lazy"
className="rounded-lg border"
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
p.property_images?.[0]?.image_url || "/placeholder.jpg";

const price =
new Intl.NumberFormat("en-IN").format(p.price);

return(
<a
key={p.id}
href={`/property/${p.id}/${p.slug}`}
className="card-soft overflow-hidden hover:shadow-medium transition"
>

<img src={image} className="h-40 w-full object-cover"/>

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

<div id="contact" className="space-y-6 lg:sticky lg:top-24 h-fit">

<div className="card-soft p-6">

<div className="font-semibold text-lg mb-3">
Seller
</div>

<div className="flex items-center gap-3">

<div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center">
{sellerData.full_name?.charAt(0)}
</div>

<div>

<div className="font-medium">
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