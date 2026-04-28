"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { uploadPropertyMedia } from "@/lib/storage/uploadImage";
import { useRouter, useParams } from "next/navigation";
import { buildPropertySeoFields } from "@/lib/seo/propertySeo";

const supabase = createClient();

const AMENITIES = [
  "Lift", "Gym", "Swimming Pool", "Power Backup", "24x7 Security", "CCTV",
  "Intercom", "Garden", "Club House", "Visitor Parking", "Children Play Area",
  "Jogging Track", "Community Hall", "Senior Citizen Area", "Rainwater Harvesting",
  "Fire Safety", "Gas Pipeline", "Wi-Fi", "Air Conditioning", "Balcony",
  "Modular Kitchen", "Pet Friendly", "Wheelchair Accessible", "EV Charging",
  "Nearby Metro", "School Nearby", "Hospital Nearby", "Shopping Mall Nearby"
];

export default function EditPropertyPage() {

  const router = useRouter();
  const params = useParams();
  const propertyId = params.id as string;

  const [loading,setLoading] = useState(true);
  const [saving,setSaving] = useState(false);
  const [message,setMessage] = useState("");

  const [property,setProperty] = useState<any>(null);

  const [states,setStates] = useState<any[]>([]);
  const [cities,setCities] = useState<any[]>([]);
  const [localities,setLocalities] = useState<any[]>([]);
  const [selectedState,setSelectedState] = useState("");
  const [localityName,setLocalityName] = useState("");

  const [newImages,setNewImages] = useState<File[]>([]);
  const [video,setVideo] = useState<File | null>(null);
  const [ownershipDocs,setOwnershipDocs] = useState<File[]>([]);
  const [amenities,setAmenities] = useState<string[]>([]);

  /* ================= LOAD STATES ================= */

  useEffect(()=>{
    loadStates();
  },[]);

  async function loadStates(){
    const { data } =
      await supabase
        .from("states")
        .select("id,name")
        .order("name");

    if(data) setStates(data);
  }

  /* ================= LOAD CITIES ================= */

  async function loadCitiesForState(stateId:string){
    if(!stateId) return;

    const { data } =
      await supabase
        .from("cities")
        .select("id,name")
        .eq("state_id", stateId)
        .order("name");

    if(data) setCities(data);
  }

  async function loadLocalitiesForCity(cityId:string){
    if(!cityId) return;

    const { data } =
      await supabase
        .from("localities")
        .select("id,name")
        .eq("city_id", cityId)
        .order("name");

    if(data) setLocalities(data);
  }

  useEffect(()=>{
    if(selectedState){
      loadCitiesForState(selectedState);
    }
  },[selectedState]);

  /* ================= FETCH PROPERTY ================= */

  useEffect(()=>{ fetchProperty(); },[]);

  async function fetchProperty(){

    const { data:{ session } } =
      await supabase.auth.getSession();

    if(!session){
      router.push("/login");
      return;
    }

    const { data } =
      await supabase
        .from("properties")
        .select(`
          *,
          cities(id,state_id,name),
          localities(name),
          property_images(id,image_url),
          property_videos(id,video_url)
        `)
        .eq("id",propertyId)
        .single();

    if(!data){
      router.push("/dashboard");
      return;
    }

    setAmenities(data.amenities || []);

    setProperty({
      ...data,
      price:data.price?.toString() || "",
      property_images:data.property_images || [],
      property_videos:data.property_videos || []
    });
    setLocalityName(data.localities?.name || "");

    const stateId = data.cities?.state_id || "";

    setSelectedState(stateId);
    await loadCitiesForState(stateId);
    if(data.city_id){
      await loadLocalitiesForCity(data.city_id);
    }

    setLoading(false);
  }

  /* ================= HELPERS ================= */

  function toggleAmenity(item:string){
    if(amenities.includes(item)){
      setAmenities(amenities.filter(a=>a!==item));
    }else{
      setAmenities([...amenities,item]);
    }
  }

  function handleImageSelect(files:FileList){
    setNewImages(Array.from(files));
  }

  function handleVideoSelect(file:File){
    setVideo(file);
  }

  function handleOwnershipDocsSelect(files:FileList | null){
    if(!files) return;

    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/pdf"
    ];

    const validFiles = Array.from(files).filter((file)=>{
      if(file.size > 10*1024*1024){
        setMessage(`"${file.name}" exceeds 10MB.`);
        return false;
      }
      if(!allowedTypes.includes(file.type)){
        setMessage(`"${file.name}" is not a supported format.`);
        return false;
      }
      return true;
    });

    if(!validFiles.length) return;

    setOwnershipDocs((prev)=>[...prev, ...validFiles]);
  }

  async function getProfileId(authId:string){
    const { data } =
      await supabase
        .from("users")
        .select("id")
        .eq("user_id",authId)
        .single();
    return data?.id;
  }

  async function ensureLocality(){
    if(!property.city_id || !localityName.trim()){
      return null;
    }

    const normalizedName = localityName.trim();

    const selectedLocality = localities.find(
      (locality)=>locality.name.toLowerCase() === normalizedName.toLowerCase()
    );

    if(selectedLocality) return selectedLocality.id;

    const { data:existing } =
      await supabase
        .from("localities")
        .select("id")
        .eq("city_id", property.city_id)
        .ilike("name", normalizedName)
        .maybeSingle();

    if(existing) return existing.id;

    const { data } =
      await supabase
        .from("localities")
        .insert({
          city_id:property.city_id,
          name:normalizedName
        })
        .select("id")
        .single();

    return data?.id || null;
  }

  async function removeExistingImage(id:string){

    await supabase
      .from("property_images")
      .delete()
      .eq("id",id);

    setProperty({
      ...property,
      property_images:
        property.property_images.filter((i:any)=>i.id!==id)
    });
  }

  /* ================= SAVE ================= */

  async function handleSave(){

    setSaving(true);

    try{

      const { data:{ session } } =
        await supabase.auth.getSession();

      if(!session) throw new Error("Session expired");

      const profileId =
        await getProfileId(session.user.id);
      const localityId = await ensureLocality();
      const seoFields = buildPropertySeoFields(property.title, property.description);

      const shouldMoveToPending =
        property.status==="approved" ||
        property.status==="rejected";

      const preferredTenant =
        property.listing_type==="Rent"
        ? property.preferred_tenant || null
        : null;

      if(property.listing_type === "Rent" && !preferredTenant){
        throw new Error("Preferred tenant is required for rent listings.");
      }

      if (property.listing_type === "Rent") {
        const hasRate = Boolean(
          property.hourly_rate || property.daily_rate || property.monthly_rate || property.price
        );
        if (!hasRate) {
          throw new Error("Provide at least one rent rate (hourly, daily, or monthly).");
        }
      }

      await supabase
        .from("properties")
        .update({
          title:property.title,
          description:property.description,
          price:Number(property.price),
          city_id:property.city_id,
          locality_id:localityId || null,
          listing_type:property.listing_type,
          property_type:property.property_type,
          bedrooms:property.bedrooms || null,
          bathrooms:property.bathrooms || null,
          parking:property.parking || 0,
          floors:property.floors || null,
          area_sqft:property.area_sqft || null,
          furnishing_status:property.furnishing_status || null,
          built_up_area:property.built_up_area || null,
          carpet_area:property.carpet_area || null,
          maintenance_charges:property.maintenance_charges || null,
          gated_security:property.gated_security,
          ...seoFields,
          amenities,
          preferred_tenant:preferredTenant,
          rent_frequency:
            property.listing_type === "Rent"
              ? [
                  property.hourly_rate ? "Hourly" : null,
                  property.daily_rate ? "Daily" : null,
                  property.monthly_rate || property.price ? "Monthly" : null,
                ].filter(Boolean)
              : null,
          hourly_rate:
            property.listing_type === "Rent" && property.hourly_rate
              ? Number(property.hourly_rate)
              : null,
          daily_rate:
            property.listing_type === "Rent" && property.daily_rate
              ? Number(property.daily_rate)
              : null,
          monthly_rate:
            property.listing_type === "Rent"
              ? Number(property.monthly_rate || property.price)
              : null,
          status:shouldMoveToPending ? "pending" : property.status,
          verification_status:shouldMoveToPending
            ? "edited_requires_review"
            : property.verification_status,
          updated_at:new Date().toISOString()
        })
        .eq("id",propertyId);

      /* MEDIA */

      if(newImages.length>0 || video){

        const media =
          await uploadPropertyMedia({
            propertyId,
            images:newImages,
            video
          });

        if(media.images?.length){
          await supabase
            .from("property_images")
            .insert(
              media.images.map((url:string)=>({
                property_id:propertyId,
                image_url:url
              }))
            );
        }

        if(media.video){
          await supabase
            .from("property_videos")
            .insert({
              property_id:propertyId,
              video_url:media.video
            });
        }
      }

      /* OWNERSHIP */

      if(ownershipDocs.length){
        const docsRows = [];

        for(const ownershipDoc of ownershipDocs){
          const path =
            `${propertyId}/${Date.now()}-${ownershipDoc.name}`;

          const { error } =
            await supabase.storage
              .from("ownership-documents")
              .upload(path,ownershipDoc);

          if(error) throw new Error("Ownership upload failed");

          docsRows.push({
            user_id:profileId,
            property_id:propertyId,
            document_type:"ownership",
            document_subtype:"resubmitted",
            document_url:path,
            status:"pending"
          });
        }

        await supabase
          .from("documents")
          .insert(docsRows);

        await supabase
          .from("properties")
          .update({
            ownership_verified:false,
            verification_status:"ownership_resubmitted",
            status:"pending",
            rejection_reason:null
          })
          .eq("id",propertyId);
      }

      setMessage("Property updated successfully.");

      setTimeout(()=>{
        router.push("/dashboard/my-listings");
      },1500);

    }catch(err:any){
      setMessage(err.message);
    }

    setSaving(false);
  }

  /* ================= UI ================= */

  if(loading)
    return <div className="p-10 text-center">Loading...</div>;

  return(

    <main className="container-custom py-12 max-w-4xl space-y-10">

      <h1 className="text-3xl font-semibold">Edit Property</h1>

      {message && <div className="badge-success">{message}</div>}

      <div className="card-soft p-8 space-y-8">

        {/* BASIC */}

        <section className="space-y-4">
          <h3 className="text-lg font-semibold">Basic Details</h3>

          <input className="input-premium"
            value={property.title}
            onChange={(e)=>
              setProperty({...property,title:e.target.value})
            }
          />

          <textarea className="textarea-premium"
            value={property.description}
            onChange={(e)=>
              setProperty({...property,description:e.target.value})
            }
          />

          <input type="number" className="input-premium"
            value={property.price}
            onChange={(e)=>
              setProperty({...property,price:e.target.value})
            }
          />

          <div className="grid md:grid-cols-2 gap-4">
            <select className="input-premium"
              value={property.listing_type || "Sale"}
              onChange={(e)=>
                setProperty({
                  ...property,
                  listing_type:e.target.value
                })
              }
            >
              <option value="Sale">For Sale</option>
              <option value="Rent">For Rent</option>
            </select>

            <select className="input-premium"
              value={property.property_type || ""}
              onChange={(e)=>
                setProperty({
                  ...property,
                  property_type:e.target.value
                })
              }
            >
              <option value="">Property Type</option>
              <option>Apartment</option>
              <option>House</option>
              <option>Villa</option>
              <option>Plot</option>
              <option>Commercial</option>
            </select>
          </div>
        </section>

        {/* LOCATION */}

        <section className="space-y-4">
          <h3 className="text-lg font-semibold">Location</h3>

          <select
            className="input-premium"
            value={selectedState}
            onChange={(e)=>{
              const stateId = e.target.value;
              setSelectedState(stateId);
              setCities([]);
              setLocalities([]);

              setProperty({
                ...property,
                city_id:"",
                locality_id:""
              });
              setLocalityName("");
            }}
          >
            <option value="">Select State</option>
            {states.map((s)=>(
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>

          <select
            className="input-premium"
            value={property.city_id || ""}
            disabled={!selectedState}
            onChange={(e)=>
              {
                const cityId = e.target.value;
                setProperty({
                  ...property,
                  city_id:cityId,
                  locality_id:""
                });
                setLocalityName("");
                loadLocalitiesForCity(cityId);
              }
            }
          >
            <option value="">Select City</option>
            {cities.map((c)=>(
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          <input
            className="input-premium"
            value={localityName}
            placeholder="Enter locality"
            list="edit-localities-list"
            disabled={!property.city_id}
            onChange={(e)=>setLocalityName(e.target.value)}
          />
          <datalist id="edit-localities-list">
            {localities.map((locality)=>(
              <option key={locality.id} value={locality.name} />
            ))}
          </datalist>

        </section>

        <section className="space-y-4">
          <h3 className="text-lg font-semibold">Property Details</h3>

          <div className="grid md:grid-cols-3 gap-4">
            <input type="number" className="input-premium" placeholder="Bedrooms"
              value={property.bedrooms || ""}
              onChange={(e)=> setProperty({...property, bedrooms:e.target.value})}
            />
            <input type="number" className="input-premium" placeholder="Bathrooms"
              value={property.bathrooms || ""}
              onChange={(e)=> setProperty({...property, bathrooms:e.target.value})}
            />
            <input type="number" className="input-premium" placeholder="Parking"
              value={property.parking || ""}
              onChange={(e)=> setProperty({...property, parking:e.target.value})}
            />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <input type="number" className="input-premium" placeholder="Super Built-up Area (sqft)"
              value={property.area_sqft || ""}
              onChange={(e)=> setProperty({...property, area_sqft:e.target.value})}
            />
            <input type="number" className="input-premium" placeholder="Built-up Area (sqft)"
              value={property.built_up_area || ""}
              onChange={(e)=> setProperty({...property, built_up_area:e.target.value})}
            />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <input type="number" className="input-premium" placeholder="Carpet Area (sqft)"
              value={property.carpet_area || ""}
              onChange={(e)=> setProperty({...property, carpet_area:e.target.value})}
            />
            <input type="number" className="input-premium" placeholder="Floors"
              value={property.floors || ""}
              onChange={(e)=> setProperty({...property, floors:e.target.value})}
            />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <input type="number" className="input-premium" placeholder="Maintenance Charges"
              value={property.maintenance_charges || ""}
              onChange={(e)=> setProperty({...property, maintenance_charges:e.target.value})}
            />

            <select className="input-premium"
              value={property.furnishing_status || ""}
              onChange={(e)=> setProperty({...property, furnishing_status:e.target.value})}
            >
              <option value="">Furnishing Status</option>
              <option>Unfurnished</option>
              <option>Semi Furnished</option>
              <option>Fully Furnished</option>
            </select>
          </div>

          {property.listing_type === "Rent" && (
            <div className="grid md:grid-cols-3 gap-4">
              <input
                type="number"
                className="input-premium"
                placeholder="Hourly Rent (₹)"
                value={property.hourly_rate || ""}
                onChange={(e)=> setProperty({...property, hourly_rate:e.target.value})}
              />
              <input
                type="number"
                className="input-premium"
                placeholder="Daily Rent (₹)"
                value={property.daily_rate || ""}
                onChange={(e)=> setProperty({...property, daily_rate:e.target.value})}
              />
              <input
                type="number"
                className="input-premium"
                placeholder="Monthly Rent (₹)"
                value={property.monthly_rate || property.price || ""}
                onChange={(e)=> setProperty({...property, monthly_rate:e.target.value, price:e.target.value || property.price})}
              />
            </div>
          )}

          {property.listing_type === "Rent" && (
            <select className="input-premium"
              value={property.preferred_tenant || ""}
              onChange={(e)=> setProperty({...property, preferred_tenant:e.target.value})}
            >
              <option value="">Preferred Tenant</option>
              <option>Family</option>
              <option>Bachelors</option>
              <option>Any</option>
            </select>
          )}

          <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              checked={Boolean(property.gated_security)}
              onChange={(e)=>setProperty({...property, gated_security:e.target.checked})}
            />
            Gated Security
          </label>

        </section>

        {/* AMENITIES */}

        <section>
          <h3 className="text-lg font-semibold">Amenities</h3>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-2">
            {AMENITIES.map(a=>{
              const selected = amenities.includes(a);
              return(
                <button
                  key={a}
                  type="button"
                  onClick={()=>toggleAmenity(a)}
                  className={`chip ${selected?"bg-red-100 text-red-600":""}`}
                >
                  {a}
                </button>
              );
            })}
          </div>
        </section>

        {/* IMAGES */}

        <section className="space-y-4">
          <h3 className="text-lg font-semibold">Property Images</h3>

          <div className="grid grid-cols-3 gap-3">
            {property.property_images.map((img:any)=>(
              <div key={img.id} className="relative">
                <img src={img.image_url} className="rounded-lg border"/>
                <button type="button"
                  onClick={()=>removeExistingImage(img.id)}
                  className="absolute top-1 right-1 bg-black/70 text-white text-xs px-2 py-1 rounded">
                  Remove
                </button>
              </div>
            ))}
          </div>

          <input type="file" multiple accept="image/*"
            className="input-premium"
            onChange={(e)=>
              e.target.files && handleImageSelect(e.target.files)
            }
          />
        </section>

        {/* VIDEO */}

        <section className="space-y-4">
          <h3 className="text-lg font-semibold">Property Video</h3>

          {property.property_videos?.[0] && (
            <video controls className="rounded-lg border"
              src={property.property_videos[0].video_url}/>
          )}

          <input type="file" accept="video/*"
            className="input-premium"
            onChange={(e)=>{
              const file=e.target.files?.[0];
              if(file) handleVideoSelect(file);
            }}
          />
        </section>

        {/* OWNERSHIP */}

        <section>
          <h3 className="text-lg font-semibold">
            Re-Upload Ownership Documents
          </h3>

          <input type="file"
            multiple
            accept=".jpg,.jpeg,.png,.webp,.pdf"
            className="input-premium"
            onChange={(e)=>
              handleOwnershipDocsSelect(e.target.files)
            }
          />
          {ownershipDocs.length > 0 && (
            <ul className="mt-3 space-y-2 text-sm text-gray-600">
              {ownershipDocs.map((doc, index)=>(
                <li key={`${doc.name}-${index}`}>• {doc.name}</li>
              ))}
            </ul>
          )}
        </section>

        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-primary w-full">
          {saving ? "Saving..." : "Save Changes"}
        </button>

      </div>

    </main>
  );
}
