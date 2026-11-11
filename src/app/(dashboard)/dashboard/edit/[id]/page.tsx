"use client";
import OwnerListingFields from "@/components/property/OwnerListingFields";
import { loadOwnerListingDefaults } from "@/lib/owner-listing-defaults";
import { applyOwnerDefaults, validateOwnerFields } from "@/lib/owner-verification";
import { useFormFeedback } from "@/lib/use-form-feedback";
import RentalAvailabilityFields from "@/components/property/RentalAvailabilityFields";
import { rentalDetailsPayload } from "@/lib/property-rental-details";

import TextLimitCounter from "@/components/property/TextLimitCounter";
import { validatePropertyTextLimits, countTitleCharacters, countDescriptionWords } from "@/lib/property-text-limits";

import { hasPropertyContactDetails, DESCRIPTION_CONTACT_MESSAGE, TITLE_CONTACT_MESSAGE } from "@/lib/property-description-policy";

import MediaFilePreview from "@/components/property/MediaFilePreview";
import { useEffect, useRef, useState } from "react";
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

function isRentListingType(value?: string | null) {
  return ["rent", "rental", "lease"].includes(String(value || "").toLowerCase());
}

function isSaleListingType(value?: string | null) {
  return ["sell", "sale"].includes(String(value || "").toLowerCase());
}

export default function EditPropertyPage() {

  const router = useRouter();
  const params = useParams();
  const propertyId = params.id as string;

  const [isAdmin, setIsAdmin] = useState(false);
  const [declaredOwnerKind, setDeclaredOwnerKind] = useState<string | null>(null);
  const [loading,setLoading] = useState(true);
  const [saving,setSaving] = useState(false);
  const { feedback, feedbackRef, showFeedback } = useFormFeedback();
  const message = feedback.text;
  const setMessage = (text: string) => showFeedback(text, text === "Property updated successfully." ? "success" : "error");

  const [property,setProperty] = useState<any>(null);

  const [states,setStates] = useState<any[]>([]);
  const [cities,setCities] = useState<any[]>([]);
  const [localities,setLocalities] = useState<any[]>([]);
  const [selectedState,setSelectedState] = useState("");
  const [localityName,setLocalityName] = useState("");

  const [newImages,setNewImages] = useState<File[]>([]);
  const [cover, setCover] = useState<string | File | null>(null);
  const [uploadStatus, setUploadStatus] = useState("");
  const uploadedVideo = useRef<{ file: File; url: string } | null>(null);
  const [videoProgress, setVideoProgress] = useState<number | null>(null);
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
          property_images(id,image_url,sort_order),
          property_videos(id,video_url)
        `)
        .eq("id",propertyId)
        .single();

    if(!data){
      router.push("/dashboard");
      return;
    }

    const { data: actor } = await supabase.from("users").select("id,role,seller_identity,full_name,kyc_status,seller_legal_name").eq("user_id",session.user.id).maybeSingle();
    setIsAdmin(actor?.role === "admin");
    setDeclaredOwnerKind(actor?.seller_identity || null);
    const ownerDefaults = actor && actor.role !== "admin" ? await loadOwnerListingDefaults(actor) : null;
    setAmenities(data.amenities || []);

    setProperty({
      ...data,
      ...(ownerDefaults ? applyOwnerDefaults(data, ownerDefaults) : {}),
      price:data.price?.toString() || "",
      monthly_rate:data.monthly_rate?.toString() || (isRentListingType(data.listing_type) ? data.price?.toString() || "" : ""),
      daily_rate:data.daily_rate?.toString() || "",
      hourly_rate:data.hourly_rate?.toString() || "",
      property_images:(data.property_images || []).sort((a:any,b:any)=>(a.sort_order ?? 0)-(b.sort_order ?? 0)),
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
    const selected = Array.from(files);
    const invalid = selected.find(file => !["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 10 * 1024 * 1024);
    if (invalid) { setMessage(`${invalid.name}: choose a JPG, PNG or WebP image up to 10 MB.`); return; }
    setMessage("");
    setNewImages(prev => [...prev, ...selected]);
  }

  function handleVideoSelect(file:File){
    if (!["video/mp4", "video/webm", "video/quicktime"].includes(file.type) || file.size > 50 * 1024 * 1024) {
      setMessage("Choose an MP4, WebM or MOV video up to 50 MB."); return;
    }
    setMessage("");
    setVideoProgress(null);
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

    const { data: created, error: createError } =
      await supabase
        .from("localities")
        .insert({
          city_id: property.city_id,
          name: normalizedName,
        })
        .select("id")
        .single();

    if(createError){
      const { data: retryExisting, error: retryError } =
        await supabase
          .from("localities")
          .select("id")
          .eq("city_id", property.city_id)
          .ilike("name", normalizedName)
          .maybeSingle();

      if(retryError){
        throw new Error(retryError.message || "Could not create locality.");
      }

      if(retryExisting) return retryExisting.id;

      throw new Error(createError.message || "Could not create locality.");
    }

    return created.id;
  }

  async function removeExistingImage(id:string){

    const { error } = await supabase
      .from("property_images")
      .delete()
      .eq("id",id);

    if (error) { setMessage(error.message); return; }
    if (cover === id) setCover(null);
    setProperty({
      ...property,
      property_images:
        property.property_images.filter((i:any)=>i.id!==id)
    });
  }



  async function moveImage(imageId:string,direction:-1|1){
    const currentIndex = property.property_images.findIndex((img:any)=>img.id===imageId);
    const targetIndex = currentIndex + direction;

    if(currentIndex < 0 || targetIndex < 0 || targetIndex >= property.property_images.length){
      return;
    }

    const reordered = [...property.property_images];
    const [item] = reordered.splice(currentIndex,1);
    reordered.splice(targetIndex,0,item);

    setProperty({
      ...property,
      property_images: reordered.map((img:any,index:number)=>({
        ...img,
        sort_order:index
      }))
    });
  }

  async function persistImageOrder(images: { id: string; image_url: string }[]) {
    const selectedId = typeof cover === "string" ? cover : null;
    const ordered = selectedId ? [...images.filter(img => img.id === selectedId), ...images.filter(img => img.id !== selectedId)] : images;
    for (const [index, img] of ordered.entries()) {
      const { error } = await supabase.from("property_images")
        .update({ sort_order: index }).eq("id", img.id).eq("property_id", propertyId).select("id").single();
      if (error) throw new Error(`Could not save image order: ${error.message}`);
    }
  }
  /* ================= SAVE ================= */

  async function handleSave(){

    if (saving) return;
    const ownerError = validateOwnerFields(property, isAdmin);
    if (ownerError) { setMessage(ownerError); return; }
    const limitError = validatePropertyTextLimits(property.title, property.description);
    if (limitError) { setMessage(limitError); return; }
    if (hasPropertyContactDetails(property.title)) { setMessage(TITLE_CONTACT_MESSAGE); return; }
    if (hasPropertyContactDetails(property.description)) { setMessage(DESCRIPTION_CONTACT_MESSAGE); return; }
    setSaving(true);
    setMessage("");
    setVideoProgress(null);
    setUploadStatus("Saving property details...");

    try{

      const { data:{ session } } =
        await supabase.auth.getSession();

      if(!session) throw new Error("Session expired");

      const { data: actor, error: actorError } = await supabase.from("users").select("id,role,seller_identity,full_name,kyc_status,seller_legal_name").eq("user_id", session.user.id).single();
      if (actorError || !actor) throw new Error("Could not verify your owner declaration. Refresh the page and try again.");
      setIsAdmin(actor.role === "admin");
      setDeclaredOwnerKind(actor.seller_identity || null);
      if (actor.role !== "admin" && property.owner_kind !== actor.seller_identity) {
        const defaults = await loadOwnerListingDefaults(actor);
        setProperty((previous: typeof property) => ({ ...previous, ...applyOwnerDefaults(previous, defaults) }));
        throw new Error("Your Profile declaration changed. We updated the owner category; review the legal owner/project details and confirm this property again before saving.");
      }
      const currentOwnerError = validateOwnerFields(property, actor.role === "admin", actor.seller_identity || null);
      if (currentOwnerError) throw new Error(currentOwnerError);

      const costAndAvailability = rentalDetailsPayload(property, isRentListingType(property.listing_type));
      const profileId =
        await getProfileId(session.user.id);
      const localityId = await ensureLocality();
      const seoFields = buildPropertySeoFields(property.title, property.description);

      const preferredTenant =
        isRentListingType(property.listing_type)
        ? property.preferred_tenant || null
        : null;

      if(isRentListingType(property.listing_type) && !preferredTenant){
        throw new Error("Preferred tenant is required for rent listings.");
      }

      if (isRentListingType(property.listing_type)) {
        const hasRate = [property.monthly_rate, property.daily_rate, property.hourly_rate].some((value)=>{
          const parsed = Number(value);
          return Number.isFinite(parsed) && parsed > 0;
        });
        if (!hasRate) {
          throw new Error("Please enter at least one rent amount.");
        }
      }
      if (isSaleListingType(property.listing_type) && !(Number(property.price) > 0)) {
        throw new Error("Please enter the expected selling price.");
      }

      const isRentListing = isRentListingType(property.listing_type);
      const monthlyRate = property.monthly_rate ? Number(property.monthly_rate) : null;
      const dailyRate = property.daily_rate ? Number(property.daily_rate) : null;
      const hourlyRate = property.hourly_rate ? Number(property.hourly_rate) : null;
      const canonicalPrice = isRentListing
        ? (monthlyRate ?? dailyRate ?? hourlyRate)
        : Number(property.price);

      const { error: propertyError } = await supabase
        .from("properties")
        .update({
          owner_kind: property.owner_kind || null,
          owner_legal_name: property.owner_legal_name || null,
          owner_project_name: property.owner_project_name || null,
          owner_attested: Boolean(property.owner_attested),
          title:property.title,
          description:property.description,
          price:canonicalPrice,
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
          ...costAndAvailability,
          gated_security:property.gated_security,
          ...seoFields,
          amenities,
          preferred_tenant:preferredTenant,
          rent_frequency:
            isRentListing
              ? [
                  hourlyRate ? "Hourly" : null,
                  dailyRate ? "Daily" : null,
                  monthlyRate ? "Monthly" : null,
                ].filter(Boolean)
              : null,
          hourly_rate: isRentListing ? hourlyRate : null,
          daily_rate: isRentListing ? dailyRate : null,
          monthly_rate: isRentListing ? monthlyRate : null,
          // The database derives review states from the actual changes. Sending
          // cached states can overwrite a newer review, and the obsolete
          // edited_requires_review value exceeds legacy varchar(20) columns.
          updated_at:new Date().toISOString()
        })
        .eq("id",propertyId).select("id").single();
      if (propertyError) throw new Error(propertyError.message);

      let allImages = [...property.property_images];

      /* MEDIA */

      if(newImages.length>0 || video){

        const media =
          await uploadPropertyMedia({
            propertyId,
            images:newImages,
            video: uploadedVideo.current?.file === video ? null : video,
            onProgress: setUploadStatus,
            onVideoProgress: setVideoProgress
          });

        if(media.images?.length){
          const { data: addedImages, error: imageError } = await supabase
            .from("property_images")
            .insert(
              media.images.map((url:string,index:number)=>({
                property_id:propertyId,
                image_url:url,
                sort_order:(property.property_images?.length || 0) + index
              }))
            ).select("id,image_url,sort_order");
          if (imageError) throw new Error(imageError.message);
          const uploaded = media.images.map(url => addedImages?.find(img => img.image_url === url)).filter(Boolean);
          allImages = [...allImages, ...uploaded];
          if (cover instanceof File) {
            const coverUrl = media.images[newImages.indexOf(cover)];
            allImages = [...allImages.filter(img => img.image_url === coverUrl), ...allImages.filter(img => img.image_url !== coverUrl)];
            setCover(allImages[0]?.id || null);
          }
          setNewImages([]);
          setProperty((prev: any) => ({ ...prev, property_images: allImages }));
        }

        if (media.video && video) uploadedVideo.current = { file: video, url: media.video };
        if (!media.video && uploadedVideo.current?.file === video) {
          media.video = uploadedVideo.current!.url;
          setVideoProgress(100);
        }

        if(media.video){
          setUploadStatus("Saving video to listing...");
          const { data: savedVideo, error: videoError } = await supabase.rpc("save_property_video", {
            p_property_id: propertyId,
            p_video_url: media.video,
          }).single<{ id: string; video_url: string }>();
          if (videoError) {
            if (videoError.code === "PGRST202") throw new Error("Apply the save_property_video database migration to enable video saving.");
            throw new Error(`Video uploaded, but could not be saved to the listing: ${videoError.message}`);
          }
          if (!savedVideo?.id) throw new Error("Video saving was not confirmed. Please try again.");
          setProperty((prev: any) => ({ ...prev, property_videos: [savedVideo] }));
          setVideo(null);
          uploadedVideo.current = null;
        }
      }

      setUploadStatus("Saving cover image and photo order...");
      await persistImageOrder(allImages);

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
            user_id:property.seller_id || profileId,
            property_id:propertyId,
            document_type:"ownership",
            document_subtype:"resubmitted",
            document_url:path,
            status:"pending"
          });
        }

        const { error: documentsError } = await supabase
          .from("documents")
          .insert(docsRows);
        if (documentsError) throw new Error(`Property details were saved, but ownership evidence could not be submitted: ${documentsError.message}`);
        // The evidence_resubmitted database trigger invalidates ownership and
        // queues review atomically. Do not issue a second unchecked update.
      }

      setMessage("Property updated successfully.");

      setTimeout(()=>{
        router.push("/dashboard/my-listings");
      },1500);

    }catch(err:any){
      setMessage(err.message);
    }

    setSaving(false);
    setUploadStatus("");
  }

  /* ================= UI ================= */

  if(loading)
    return <div className="p-10 text-center">Loading...</div>;

  return(

    <main className="container-custom py-12 max-w-4xl space-y-10">

      <h1 className="text-3xl font-semibold">Edit Property</h1>

      {message && <div ref={feedbackRef} tabIndex={-1} role={feedback.kind === "error" ? "alert" : "status"} className={`rounded-lg border p-4 outline-none ${feedback.kind === "error" ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{message}</div>}

      <fieldset disabled={saving} className="card-soft min-w-0 p-8 space-y-8 disabled:opacity-75">

        <OwnerListingFields value={property} onChange={patch => setProperty((prev: typeof property) => ({ ...prev, ...patch }))} isAdmin={isAdmin} declaredOwnerKind={declaredOwnerKind} />

        {/* BASIC */}

        <section className="space-y-4">
          <h3 className="text-lg font-semibold">Basic Details</h3>

          <input className="input-premium"
            aria-label="Property title"
            aria-describedby="title-contact-hint title-limit"
            aria-invalid={hasPropertyContactDetails(property.title) || countTitleCharacters(property.title) > 100}
            value={property.title}
            onChange={(e)=>
              setProperty({...property,title:e.target.value})
            }
          />

          <TextLimitCounter id="title-limit" value={property.title || ""} kind="title" />
          <p id="title-contact-hint" className="text-sm text-slate-600">Keep contact details out of the title. Buyers can use Contact Seller.</p>

          <textarea className="textarea-premium"
            aria-describedby="description-contact-hint description-limit"
            aria-invalid={hasPropertyContactDetails(property.description) || countDescriptionWords(property.description) > 3000}
            value={property.description}
            onChange={(e)=>
              setProperty({...property,description:e.target.value})
            }
          />

          <TextLimitCounter id="description-limit" value={property.description || ""} kind="description" />
          <p id="description-contact-hint" className="text-sm text-slate-600">Do not include phone numbers, email addresses, websites or social handles. Use the Contact Seller panel.</p>

          {isSaleListingType(property.listing_type) ? (
            <div>
              <label className="label">Expected Selling Price (₹)</label>
              <p className="text-sm text-gray-500 mb-2">
                Enter the total expected sale price of the property.
              </p>
              <input type="number" className="input-premium"
                value={property.price}
                onChange={(e)=>
                  setProperty({...property,price:e.target.value})
                }
              />
            </div>
          ) : (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Rent amount will be added in the Property Details step.
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-4">
            <select className="input-premium"
              value={property.listing_type || "Sale"}
              onChange={(e)=>
                setProperty({
                  ...property,
                  listing_type:e.target.value,
                  preferred_tenant:isRentListingType(e.target.value) ? property.preferred_tenant : "",
                  rent_frequency:isRentListingType(e.target.value) ? property.rent_frequency : null,
                  hourly_rate:isRentListingType(e.target.value) ? property.hourly_rate : "",
                  daily_rate:isRentListingType(e.target.value) ? property.daily_rate : "",
                  monthly_rate:isRentListingType(e.target.value) ? property.monthly_rate : ""
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
                locality_id:"",
                owner_attested:false
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
                  locality_id:"",
                  owner_attested:false
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
            onChange={(e)=>{setLocalityName(e.target.value);setProperty((previous: typeof property)=>({...previous,owner_attested:false}));}}
          />
          <datalist id="edit-localities-list">
            {localities.map((locality)=>(
              <option key={locality.id} value={locality.name}>{locality.name}</option>
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
            <input type="number" className={`input-premium ${isRentListingType(property.listing_type) ? "hidden" : ""}`} placeholder="Maintenance Charges"
              value={property.maintenance_charges ?? ""}
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

          {isRentListingType(property.listing_type) && (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                Enter at least one rent amount. Monthly rent is recommended for normal rental listings.
              </p>
              <p className="text-sm text-gray-500">
                Monthly rent is recommended for regular rental listings. Daily or hourly rent can be used for short-term spaces.
              </p>
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
                value={property.monthly_rate || ""}
                onChange={(e)=> setProperty({...property, monthly_rate:e.target.value})}
              />
            </div>
            </div>
          )}

          {isRentListingType(property.listing_type) && (
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

        <RentalAvailabilityFields value={property} onChange={patch => setProperty((prev: typeof property) => ({ ...prev, ...patch }))} isRent={isRentListingType(property.listing_type)} />

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

        <section className="space-y-4">
          <h3 className="text-lg font-semibold">Property photos</h3>
          <p className="text-sm text-slate-600">Choose a cover for your listing cards. Photo order and cover are saved with Save Changes.</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {property.property_images.map((img:any, index:number) => (
              <div key={img.id} className="overflow-hidden rounded-xl border bg-white">
                <img src={img.image_url} alt={`Property photo ${index + 1}`} className="aspect-square w-full object-cover" />
                <div className="p-2 space-y-2">
                  <button type="button" aria-pressed={cover === img.id || (!cover && index === 0)}
                    onClick={() => setCover(img.id)} className="w-full rounded border px-2 py-2 text-sm aria-pressed:bg-emerald-100 aria-pressed:text-emerald-800">
                    {cover === img.id || (!cover && index === 0) ? "✓ Cover image" : "Set as cover"}
                  </button>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <button type="button" disabled={index === 0} aria-label={`Move photo ${index + 1} earlier`} onClick={() => moveImage(img.id,-1)} className="rounded border p-2 disabled:opacity-40">←</button>
                    <button type="button" disabled={index === property.property_images.length - 1} aria-label={`Move photo ${index + 1} later`} onClick={() => moveImage(img.id,1)} className="rounded border p-2 disabled:opacity-40">→</button>
                    <button type="button" onClick={() => removeExistingImage(img.id)} className="rounded border p-2 text-red-700">Remove</button>
                  </div>
                </div>
              </div>
            ))}
            {newImages.map((file,index) => (
              <div key={`${file.name}-${index}`} className="overflow-hidden rounded-xl border border-blue-200">
                <MediaFilePreview file={file} />
                <div className="p-2 space-y-2 text-sm">
                  <p className="truncate">{file.name}</p>
                  <p className="text-xs text-slate-500">New · {(file.size / 1024 / 1024).toFixed(1)} MB · Not saved yet</p>
                  <button type="button" aria-pressed={cover === file || (!cover && !property.property_images.length && index === 0)} onClick={() => setCover(file)} className="w-full rounded border p-2 aria-pressed:bg-emerald-100">
                    {cover === file || (!cover && !property.property_images.length && index === 0) ? "✓ Cover image" : "Set as cover"}
                  </button>
                  <button type="button" onClick={() => { setNewImages(prev => prev.filter((_, i) => i !== index)); if (cover === file) setCover(null); }} className="text-red-700">Remove selected photo</button>
                </div>
              </div>
            ))}
          </div>
          <label className="block cursor-pointer rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-6 focus-within:ring-2 focus-within:ring-blue-500">
            <span className="block font-semibold">＋ Add photos</span>
            <span className="block text-sm text-slate-500">JPG, PNG or WebP · Up to 10 MB each · Select multiple files</span>
            <input aria-label="Add property photos" type="file" multiple accept="image/jpeg,image/png,image/webp" className="mt-3 block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-4 file:py-2 file:text-white"
              onChange={e => { if (e.target.files) handleImageSelect(e.target.files); e.target.value = ""; }} />
          </label>
        </section>

        <section className="space-y-4">
          <h3 className="text-lg font-semibold">Property video</h3>
          {video ? <MediaFilePreview file={video} video /> : property.property_videos?.[0] && (
            <video controls preload="metadata" className="aspect-video w-full rounded-xl bg-black" src={property.property_videos[0].video_url} />
          )}
          {videoProgress !== null && (
            <div className="space-y-2" aria-live="polite">
              <div className="flex justify-between text-sm font-medium">
                <span>{saving ? (videoProgress < 100 ? "Uploading video" : "Video transferred · saving listing") : message === "Property updated successfully." ? "Video saved" : videoProgress < 100 ? "Video upload stopped · try again" : "Video transfer complete · listing not saved"}</span>
                <span>{videoProgress}%</span>
              </div>
              <progress aria-label="Video upload progress" value={videoProgress} max={100} className="h-3 w-full accent-red-600" />
            </div>
          )}
          {video && <div className="flex flex-wrap items-center gap-3 text-sm">
            <span>{video.name} · {(video.size / 1024 / 1024).toFixed(1)} MB · Not saved yet</span>
            <button type="button" onClick={() => setVideo(null)} className="text-red-700">Cancel video selection</button>
          </div>}
          <label className="block cursor-pointer rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-6 focus-within:ring-2 focus-within:ring-blue-500">
            <span className="block font-semibold">{property.property_videos.length ? "Replace video" : "＋ Add a video"}</span>
            <span className="block text-sm text-slate-500">MP4, WebM or MOV · Up to 50 MB · Saved when you click Save Changes</span>
            <input aria-label="Choose property video" type="file" accept="video/mp4,video/webm,video/quicktime" className="mt-3 block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-4 file:py-2 file:text-white"
              onChange={e => { const file = e.target.files?.[0]; if (file) handleVideoSelect(file); e.target.value = ""; }} />
          </label>
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
          {saving ? uploadStatus || "Saving..." : "Save Changes"}
        </button>

      </fieldset>

    </main>
  );
}
