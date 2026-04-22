"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { uploadPropertyMedia } from "@/lib/storage/uploadImage";

const supabase = createClient();

const AMENITIES = [
  "Lift","Gym","Swimming Pool","Power Backup","Security",
  "Garden","Club House","Visitor Parking","Children Play Area",
];

export default function AddPropertyPage() {

  const router = useRouter();

  const [states,setStates] = useState<any[]>([]);
const [selectedState,setSelectedState] = useState("");

  const [cities,setCities] = useState<any[]>([]);
  const [localityName,setLocalityName] = useState("");

  const [step,setStep] = useState(1);
  const totalSteps = 4;

  const [error,setError] = useState("");
  const [success,setSuccess] = useState("");
  const [submitting,setSubmitting] = useState(false);
  const [currentUserRole, setCurrentUserRole] = useState<"buyer" | "seller" | "admin">("seller");

  const [images,setImages] = useState<File[]>([]);
  const [dragIndex,setDragIndex] = useState<number | null>(null);

  const [video,setVideo] = useState<File | null>(null);
  const [videoPreview,setVideoPreview] = useState<string | null>(null);
  const [ownershipDocs,setOwnershipDocs] = useState<File[]>([]);

  const [amenities,setAmenities] = useState<string[]>([]);
  

  const [form,setForm] = useState({
  title:"",
  description:"",
  price:"",
  propertyType:"Apartment",
  listingType:"Sale",
  bedrooms:"",
  bathrooms:"",
  parking:"",
  floors:"",
  furnishing:"",
  builtUpArea:"",
  carpetArea:"",
  maintenance:"",
  preferredTenant:"",
  gatedSecurity:false,
  stateId:"",
  cityId:""
});

  useEffect(()=>{ loadStates(); loadCurrentUserRole(); },[]);
useEffect(()=>{ if(selectedState) loadCities(); },[selectedState]);

async function loadStates(){
  const { data } =
    await supabase
      .from("states")
      .select("id,name")
      .order("name");

  if(data) setStates(data);
}

async function loadCurrentUserRole() {
  const { data: authData } = await supabase.auth.getUser();
  const authId = authData.user?.id;
  if (!authId) return;

  const { data } = await supabase
    .from("users")
    .select("role")
    .eq("user_id", authId)
    .maybeSingle();

  if (data?.role === "admin" || data?.role === "seller" || data?.role === "buyer") {
    setCurrentUserRole(data.role);
  }
}

  async function loadCities(){
  const { data } =
    await supabase
      .from("cities")
      .select("id,name")
      .eq("state_id", selectedState)
      .order("name");

  if(data) setCities(data);
}

  const generateSlug=(title:string)=>
    title.toLowerCase()
      .replace(/[^a-z0-9]+/g,"-")
      .replace(/(^-|-$)/g,"")
      + "-" + crypto.randomUUID().slice(0,6);

  const toggleAmenity=(item:string)=>{
    if(amenities.includes(item)){
      setAmenities(amenities.filter(a=>a!==item));
    }else{
      setAmenities([...amenities,item]);
    }
  };

  const addImages=(files:File[])=>{
    if(images.length + files.length > 10){
      setError("Maximum 10 images allowed.");
      return;
    }
    setImages(prev=>[...prev,...files]);
  };

  const removeImage=(index:number)=>{
    setImages(images.filter((_,i)=>i!==index));
  };

  const handleDrop=(dropIndex:number)=>{
    if(dragIndex===null) return;
    const updated=[...images];
    const dragged=updated[dragIndex];
    updated.splice(dragIndex,1);
    updated.splice(dropIndex,0,dragged);
    setImages(updated);
    setDragIndex(null);
  };

  const handleVideoSelect=(file:File)=>{
    if(file.size > 50*1024*1024){
      setError("Video must be under 50MB.");
      return;
    }
    setVideo(file);
    setVideoPreview(URL.createObjectURL(file));
  };

  const removeVideo=()=>{
    setVideo(null);
    setVideoPreview(null);
  };

  const formatPrice=(value:string)=>{
    const num=value.replace(/\D/g,"");
    if(!num) return "";
    return new Intl.NumberFormat("en-IN").format(Number(num));
  };

  async function ensureLocality(){
    const { data: existing } =
      await supabase
      .from("localities")
      .select("id")
      .eq("city_id", form.cityId)
      .ilike("name", localityName)
      .maybeSingle();

    if (existing) return existing.id;

    const { data } =
      await supabase
      .from("localities")
      .insert({
        city_id: form.cityId,
        name: localityName
      })
      .select()
      .single();

    return data.id;
  }

  const validateStep=()=>{
    if(step===1){
      if(form.title.length<10) return "Title must be at least 10 characters.";
      if(!form.description) return "Description required.";
      if(!form.price) return "Enter price.";
    }
    if(step===2){
  if(!form.stateId) return "State required.";
  if(!form.cityId) return "City required.";
  if(!localityName) return "Locality required.";
}
    if(step===4){
      if(images.length===0) return "Upload at least one image.";
      if(currentUserRole !== "admin" && ownershipDocs.length===0){
        return "Upload at least one ownership document for approval.";
      }
    }
    
    return null;
  };

  const nextStep=()=>{
    const err=validateStep();
    if(err){ setError(err); return; }
    setError("");
    setStep(step+1);
  };

  const prevStep=()=>{
    setError("");
    setStep(step-1);
  };

  async function getProfileId(authId:string){
    const { data } = await supabase
      .from("users")
      .select("id")
      .eq("user_id", authId)
      .single();

    if(!data){
      throw new Error("Profile not found. Please complete profile first.");
    }

    return data.id;
  }

  const handleOwnershipDocsSelect=(files:FileList | null)=>{
    if(!files) return;

    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/pdf"
    ];

    const selected = Array.from(files).filter((file)=>{
      if(file.size > 10*1024*1024){
        setError(`"${file.name}" is larger than 10MB.`);
        return false;
      }
      if(!allowedTypes.includes(file.type)){
        setError(`"${file.name}" format is not supported.`);
        return false;
      }
      return true;
    }).map((file)=>
      new File(
        [file],
        `${Date.now()}-${file.name}`,
        { type:file.type }
      )
    );

    if(!selected.length) return;

    setError("");
    setOwnershipDocs((prev)=>{
      const next = [...prev, ...selected];
      if(next.length > 10){
        setError("Maximum 10 ownership documents allowed.");
        return prev;
      }
      return next;
    });
  };

  const removeOwnershipDoc=(index:number)=>{
    setOwnershipDocs((prev)=>prev.filter((_,i)=>i!==index));
  };

const handleSubmit = async (e:React.FormEvent)=>{

  e.preventDefault();

  const supabaseAction = createClient();   // ⭐ fresh client for all writes

  const err = validateStep();
  if(err){
    setError(err);
    return;
  }

  setSubmitting(true);

  try{

    /* ===== SESSION ===== */

    const { data:{ session } } =
      await supabaseAction.auth.getSession();

    if(!session) throw new Error("Session expired");

    const profileId = await getProfileId(session.user.id);
    const isAdmin = currentUserRole === "admin";
    const localityId = await ensureLocality();
    const slug = generateSlug(form.title);

    /* ===== CREATE PROPERTY ===== */

    const { data:property, error:propertyError } =
      await supabaseAction
        .from("properties")
        .insert({
          seller_id: profileId,
          title: form.title,
          description: form.description,
          price: Number(form.price),
          property_type: form.propertyType,
          listing_type: form.listingType,
          bedrooms: form.bedrooms || null,
          bathrooms: form.bathrooms || null,
          parking: form.parking || 0,
          floors: form.floors || null,
          furnishing_status: form.furnishing || null,
          built_up_area: form.builtUpArea || null,
          carpet_area: form.carpetArea || null,
          maintenance_charges: form.maintenance || null,
          preferred_tenant:
            form.listingType === "Rent"
              ? form.preferredTenant
              : null,
          gated_security: form.gatedSecurity,
          amenities,
          city_id: form.cityId,
          locality_id: localityId,
          slug,
          status: isAdmin ? "active" : "draft",
ownership_verified: isAdmin,
verification_status: isAdmin ? "approved" : "awaiting_ownership",
approved_at: isAdmin ? new Date().toISOString() : null
        })
        .select()
        .single();

    if(propertyError || !property){
      throw new Error(propertyError?.message || "Property insert failed");
    }

    /* ===== MEDIA UPLOAD ===== */

    try{

      const media =
        await uploadPropertyMedia({
          propertyId: property.id,
          images,
          video
        });

      if(media.images?.length){

        const rows = media.images.map((url:string)=>({
          property_id: property.id,
          image_url: url
        }));

        await supabaseAction
          .from("property_images")
          .insert(rows);
      }

      if(media.video){

        await supabaseAction
          .from("property_videos")
          .insert({
            property_id: property.id,
            video_url: media.video
          });
      }

    }catch(mediaErr){

      console.error("MEDIA FAIL >>>", mediaErr);

      await supabaseAction
        .from("properties")
        .update({
          verification_status: "media_failed",
          status: currentUserRole === "admin" ? "active" : "pending"
        })
        .eq("id", property.id);
    }

    /* ===== SUCCESS ===== */

    if(!isAdmin && ownershipDocs.length){
      const docsRows = [];

      for(const doc of ownershipDocs){
        const path =
          `${property.id}/${Date.now()}-${doc.name}`;

        const { error:uploadError } =
          await supabaseAction.storage
            .from("ownership-documents")
            .upload(path, doc);

        if(uploadError){
          throw new Error(uploadError.message || "Ownership document upload failed");
        }

        docsRows.push({
          user_id: profileId,
          property_id: property.id,
          document_type: "ownership",
          document_subtype: "sale_deed",
          document_url: path,
          status: "pending"
        });
      }

      const { error:docsInsertError } =
        await supabaseAction
          .from("documents")
          .insert(docsRows);

      if(docsInsertError){
        throw new Error(docsInsertError.message || "Could not save ownership documents");
      }

      await supabaseAction
        .from("properties")
        .update({
          ownership_verified: false,
          verification_status: "ownership_submitted",
          status: "pending",
          rejection_reason: null
        })
        .eq("id", property.id);
    }

    if (isAdmin) {
      setSuccess("Property published successfully. As an admin, your listing is now live.");
      setTimeout(()=>{
        router.push("/dashboard/my-listings");
      },1200);
    } else {
      setSuccess("Property created successfully and submitted with ownership documents for approval.");
      setTimeout(()=>{
        router.push("/dashboard/my-listings");
      },1500);
    }

  }catch(err:any){

    console.error(err);
    alert(err.message);
    setError(err.message || "Submission failed.");

  }finally{
    setSubmitting(false);
  }
};
  /* ===== KEEP YOUR SAME JSX UI BELOW ===== */

/* ================== RETURN UI SAME AS YOURS ================== */

  return (

    <main className="container-custom py-10">

      <h1 className="text-3xl font-semibold mb-8">
        List Your Property
      </h1>

      <div className="grid grid-cols-12 gap-8">

        {/* SIDEBAR */}

        <div className="col-span-4">

          <div className="wizard-sidebar">

            <h3 className="section-title">
              Listing Progress
            </h3>

            {[
  "Description",
  "Location",
  "Property Details",
  "Media"
].map((label,index)=>{

              const s=index+1;

              return(
                <div
                  key={label}
                  className={`wizard-step ${step===s?"active":""} ${step>s?"completed":""}`}
                >

                  <div className="wizard-circle">
                    {step>s?"✓":s}
                  </div>

                  {label}

                </div>
              );

            })}

          </div>

        </div>

        {/* FORM */}

        <div className="col-span-8">

          <div className="card-soft p-8">

            {error && <div className="badge-danger mb-4">{error}</div>}
            {success && <div className="badge-success mb-4">{success}</div>}

            <form onSubmit={handleSubmit} className="space-y-8 max-w-2xl">

              {/* STEP 1 */}

              {step===1 && (

                <section className="space-y-6">

                  <div>
                    <label className="label">Property Title</label>

                    <input
                      className="input-premium"
                      value={form.title}
                      onChange={(e)=>
                        setForm({...form,title:e.target.value})
                      }
                    />
                  </div>

                  <div>
                    <label className="label">Description</label>

                    <textarea
                      className="textarea-premium"
                      value={form.description}
                      onChange={(e)=>
                        setForm({...form,description:e.target.value})
                      }
                    />
                  </div>

                  <div>
                    <label className="label">Price</label>

                    <input
                      type="number"
                      className="input-premium"
                      value={form.price}
                      onChange={(e)=>
                        setForm({...form,price:e.target.value})
                      }
                    />

                    {form.price && (
                      <div className="text-sm text-gray-500">
                        ₹ {formatPrice(form.price)}
                      </div>
                    )}

                  </div>

                </section>

              )}

              {/* STEP 2 LOCATION */}

              {step===2 && (

<section className="space-y-6">

  {/* STATE */}

  <div>
    <label className="label">State</label>

    <select
      className="select-premium"
      value={form.stateId}
      onChange={(e)=>{
        const stateId = e.target.value;

        setForm({
          ...form,
          stateId,
          cityId:""
        });

        setSelectedState(stateId);
      }}
    >
      <option value="">Select State</option>

      {states.map((state)=>(
        <option key={state.id} value={state.id}>
          {state.name}
        </option>
      ))}

    </select>
  </div>


  {/* CITY */}

  <div>
    <label className="label">City</label>

    <select
      className="select-premium"
      value={form.cityId}
      disabled={!form.stateId}
      onChange={(e)=>
        setForm({...form,cityId:e.target.value})
      }
    >

      <option value="">Select City</option>

      {cities.map((city)=>(
        <option key={city.id} value={city.id}>
          {city.name}
        </option>
      ))}

    </select>
  </div>


  {/* LOCALITY */}

  <div>
    <label className="label">Locality</label>

    <input
      className="input-premium"
      value={localityName}
      onChange={(e)=>setLocalityName(e.target.value)}
      placeholder="Enter locality / area"
    />
  </div>

</section>

)}

              {/* STEP 3 PROPERTY DETAILS */}

{step===3 && (

<section className="space-y-8">

  {/* PROPERTY TYPE + LISTING TYPE */}

  <div className="grid md:grid-cols-2 gap-6">

    <div>
      <label className="label">
        Property Type
      </label>

      <select
        className="input-premium"
        value={form.propertyType}
        onChange={(e)=>
          setForm({
            ...form,
            propertyType:e.target.value
          })
        }
      >

        <option>Apartment</option>
        <option>House</option>
        <option>Villa</option>
        <option>Plot</option>
        <option>Commercial</option>

      </select>
    </div>

    <div>
      <label className="label">
        Listing Type
      </label>

      <select
        className="input-premium"
        value={form.listingType}
        onChange={(e)=>
          setForm({
            ...form,
            listingType:e.target.value
          })
        }
      >

        <option value="Sale">For Sale</option>
        <option value="Rent">For Rent</option>

      </select>
    </div>

  </div>


  {/* BEDROOMS / BATHROOMS */}

  <div className="grid md:grid-cols-3 gap-6">

    <div>
      <label className="label">
        Bedrooms
      </label>

      <input
        type="number"
        className="input-premium"
        value={form.bedrooms}
        onChange={(e)=>
          setForm({
            ...form,
            bedrooms:e.target.value
          })
        }
      />
    </div>

    <div>
      <label className="label">
        Bathrooms
      </label>

      <input
        type="number"
        className="input-premium"
        value={form.bathrooms}
        onChange={(e)=>
          setForm({
            ...form,
            bathrooms:e.target.value
          })
        }
      />
    </div>

    <div>
      <label className="label">
        Parking
      </label>

      <input
        type="number"
        className="input-premium"
        value={form.parking}
        onChange={(e)=>
          setForm({
            ...form,
            parking:e.target.value
          })
        }
      />
    </div>

  </div>


  {/* AREA DETAILS */}

  <div className="grid md:grid-cols-2 gap-6">

    <div>
      <label className="label">
        Built-up Area (sqft)
      </label>

      <input
        type="number"
        className="input-premium"
        value={form.builtUpArea}
        onChange={(e)=>
          setForm({
            ...form,
            builtUpArea:e.target.value
          })
        }
      />
    </div>

    <div>
      <label className="label">
        Carpet Area (sqft)
      </label>

      <input
        type="number"
        className="input-premium"
        value={form.carpetArea}
        onChange={(e)=>
          setForm({
            ...form,
            carpetArea:e.target.value
          })
        }
      />
    </div>

  </div>


  {/* FURNISHING */}

  <div>

    <label className="label">
      Furnishing Status
    </label>

    <select
      className="input-premium"
      value={form.furnishing}
      onChange={(e)=>
        setForm({
          ...form,
          furnishing:e.target.value
        })
      }
    >

      <option value="">Select</option>
      <option>Unfurnished</option>
      <option>Semi Furnished</option>
      <option>Fully Furnished</option>

    </select>

  </div>


  {/* AMENITIES */}

  <div>

    <label className="label">
      Amenities
    </label>

    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-2">

      {AMENITIES.map((a)=>{

        const selected = amenities.includes(a);

        return(

          <button
            key={a}
            type="button"
            onClick={()=>toggleAmenity(a)}
            className={`chip ${
              selected ? "bg-red-100 text-red-600" : ""
            }`}
          >
            {a}
          </button>

        )

      })}

    </div>

  </div>

</section>

)}

              {/* STEP 4 MEDIA */}

              {step===4 && (

                <section className="space-y-6">

                  <h3 className="section-title">
                    Property Images
                  </h3>

                  <div className="text-sm">
                    {images.length} / 10 photos uploaded
                  </div>

                  <div
                    className="upload-zone"
                    onDragOver={(e)=>e.preventDefault()}
                    onDrop={(e)=>{

                      e.preventDefault();

                      const files=[...e.dataTransfer.files];

                      addImages(files);

                    }}
                  >

                    <p className="text-base font-medium">Upload Property Images</p>
                    <p className="text-xs text-gray-500">Drag & drop images here or browse files.</p>

                    <input
                      type="file"
                      multiple
                      accept="image/*"
                      className="sr-only"
                      id="property-image-upload"
                      onChange={(e)=>{
                        const files=Array.from(e.target.files || []);
                        addImages(files);
                      }}
                    />
                    <label
                      htmlFor="property-image-upload"
                      className="mt-4 inline-flex cursor-pointer items-center rounded-full bg-red-600 px-5 py-2 text-sm font-semibold text-white hover:bg-red-700"
                    >
                      Choose Images
                    </label>

                  </div>

                  <div className="media-grid">

                    {images.map((img,index)=>(

                      <div
                        key={index}
                        className={`media-thumb ${index===0?"ring-2 ring-red-500":""}`}
                        draggable
                        onDragStart={()=>setDragIndex(index)}
                        onDragOver={(e)=>e.preventDefault()}
                        onDrop={()=>handleDrop(index)}
                      >

                        <img src={URL.createObjectURL(img)} />

                        {index===0 && (
                          <div className="absolute bottom-1 left-1 bg-black/70 text-white text-xs px-2 py-1 rounded">
                            Cover
                          </div>
                        )}

                        <div
                          className="media-remove"
                          onClick={()=>removeImage(index)}
                        >
                          ×
                        </div>

                      </div>

                    ))}

                  </div>

                  {/* VIDEO */}

                  <div className="space-y-3 mt-8">

                    <h3 className="section-title">
                      Property Video
                    </h3>

                    {!video && (
                      <>
                        <input
                          type="file"
                          accept="video/*"
                          className="sr-only"
                          id="property-video-upload"
                          onChange={(e)=>{

                            const file=e.target.files?.[0];

                            if(file) handleVideoSelect(file);

                          }}
                        />
                        <label
                          htmlFor="property-video-upload"
                          className="inline-flex cursor-pointer items-center rounded-full bg-gray-900 px-5 py-2 text-sm font-semibold text-white hover:bg-black"
                        >
                          Upload Property Video
                        </label>
                      </>

                    )}

                    {videoPreview && (

                      <div className="space-y-2">

                        <video
                          controls
                          className="rounded-lg w-full"
                          src={videoPreview}
                        />

                        <button
                          type="button"
                          className="text-red-600 text-sm"
                          onClick={removeVideo}
                        >
                          Remove Video
                        </button>

                      </div>

                    )}

                  </div>

                  {currentUserRole !== "admin" && (
                    <div className="space-y-3 mt-8">
                      <h3 className="section-title">
                        Ownership / Approval Documents
                      </h3>
                      <p className="text-xs text-gray-500">
                        Upload one or more ownership proofs (JPG, PNG, WEBP, PDF up to 10MB each).
                      </p>

                      <input
                        type="file"
                        multiple
                        accept=".jpg,.jpeg,.png,.webp,.pdf"
                        className="sr-only"
                        id="ownership-documents-upload"
                        onChange={(e)=>handleOwnershipDocsSelect(e.target.files)}
                      />
                      <label
                        htmlFor="ownership-documents-upload"
                        className="inline-flex cursor-pointer items-center rounded-full bg-gray-900 px-5 py-2 text-sm font-semibold text-white hover:bg-black"
                      >
                        Upload Ownership Documents
                      </label>

                      <div className="space-y-2">
                        {ownershipDocs.length===0 && (
                          <p className="text-sm text-gray-500">
                            No ownership documents selected.
                          </p>
                        )}
                        {ownershipDocs.map((doc,index)=>(
                          <div
                            key={`${doc.name}-${index}`}
                            className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm"
                          >
                            <span className="truncate pr-2">{doc.name}</span>
                            <button
                              type="button"
                              className="text-red-600"
                              onClick={()=>removeOwnershipDoc(index)}
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                </section>

              )}

              

  

              {/* ACTIONS */}

              <div className="form-actions">

                {step>1 && (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={prevStep}
                  >
                    Back
                  </button>
                )}

                {step<totalSteps && (
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={nextStep}
                  >
                    Continue
                  </button>
                )}

                {step===totalSteps && (
                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={submitting}
                  >
                    {submitting ? "Submitting..." : "Submit Property"}
                  </button>
                )}

              </div>

            </form>

          </div>

        </div>

      </div>

    </main>

  );

}
