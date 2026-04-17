"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function OwnershipUploadPage(){

  const router = useRouter();
  const params = useParams();
  const propertyId = params.id as string;

  const supabase = createClient();

  const [property,setProperty] = useState<any>(null);
  const [file,setFile] = useState<File | null>(null);
  const [ownershipType,setOwnershipType] = useState("sale_deed");

  const [loading,setLoading] = useState(true);
  const [submitting,setSubmitting] = useState(false);
  const [error,setError] = useState("");
  const [success,setSuccess] = useState("");

  useEffect(()=>{
    fetchProperty();
  },[]);

  async function fetchProperty(){

    const { data } =
      await supabase
        .from("properties")
        .select(`
          id,
          title,
          price,
          listing_type,
          cities(name),
          localities(name)
        `)
        .eq("id", propertyId)
        .single();

    setProperty(data);
    setLoading(false);
  }

  async function handleUpload(){

    if(!file){
      setError("Please select ownership document.");
      return;
    }

    setSubmitting(true);
    setError("");

    try{

      const { data:{ session } } =
        await supabase.auth.getSession();

      if(!session) throw new Error("Session expired");

      /* Get profile id */

      const { data:userRow, error:userError } =
  await supabase
    .from("users")
    .select("id")
    .eq("user_id", session.user.id)
    .single();

if(userError || !userRow){
  throw new Error("User profile not found");
}

const profileId = userRow.id;

      /* Upload to storage */

      const path =
        `${propertyId}/${Date.now()}-${file.name}`;

      const { error:uploadError } =
        await supabase.storage
          .from("ownership-documents")
          .upload(path, file);

      if(uploadError) throw uploadError;

      /* Insert document row */

      const { error:insertError } =
        await supabase
          .from("documents")
          .insert({
            user_id: profileId,
            property_id: propertyId,
            document_type: "ownership",
            document_subtype: ownershipType,
            document_url: path,
            status: "pending"
          });

      if(insertError) throw insertError;

      /* Update property lifecycle */

      await supabase
        .from("properties")
        .update({
          status: "pending",
          ownership_verified: false,
          verification_status: "ownership_submitted"
        })
        .eq("id", propertyId);

      setSuccess("Ownership document submitted successfully.");

      setTimeout(()=>{
        router.push("/dashboard/my-listings");
      },1500);

    }catch(err:any){
      console.error(err);
      setError(err.message || "Upload failed");
    }finally{
      setSubmitting(false);
    }
  }

  if(loading){
    return <div className="p-10">Loading property...</div>;
  }

  if(!property){
    return <div className="p-10">Property not found.</div>;
  }

  return (

    <main className="container-custom py-10">

      <h1 className="text-3xl font-semibold mb-6">
        Ownership Verification
      </h1>

      <div className="card-soft p-6 mb-8">

        <div className="text-xl font-semibold">
          {property.title}
        </div>

        <div className="text-gray-500 mt-1">
          {property.localities?.name}, {property.cities?.name}
        </div>

        <div className="text-red-600 font-semibold mt-2">
          ₹ {property.price}
        </div>

      </div>

      {error && <div className="badge-danger mb-4">{error}</div>}
      {success && <div className="badge-success mb-4">{success}</div>}

      <div className="card-soft p-6 max-w-xl">

        <label className="label">
          Select Ownership Proof
        </label>

        <select
          className="input-premium mb-4"
          value={ownershipType}
          onChange={(e)=>setOwnershipType(e.target.value)}
        >
          <option value="sale_deed">Sale Deed / Registry</option>
          <option value="allotment_letter">Allotment Letter</option>
          <option value="tax_receipt">Property Tax Receipt</option>
          <option value="builder_agreement">Builder Agreement</option>
        </select>

        <input
          id="ownership-proof-upload"
          type="file"
          accept=".jpg,.jpeg,.png,.webp,.pdf"
          className="sr-only"
          onChange={(e)=>{
            const f = e.target.files?.[0];
            if(!f) return;

            if(f.size > 10*1024*1024){
              setError("File must be under 10MB.");
              return;
            }

            setFile(
              new File(
                [f],
                Date.now()+"-"+f.name,
                { type:f.type }
              )
            );
          }}
        />
        <label
          htmlFor="ownership-proof-upload"
          className="mb-3 inline-flex cursor-pointer items-center rounded-full bg-red-600 px-5 py-2 text-sm font-semibold text-white hover:bg-red-700"
        >
          Upload Ownership Proof
        </label>
        <p className="text-xs text-gray-500 mb-4">
          Accepted: JPG, PNG, WEBP, PDF (max 10MB). {file ? `Selected: ${file.name}` : "No file selected."}
        </p>

        <button
          className="btn-primary"
          disabled={submitting}
          onClick={handleUpload}
        >
          {submitting ? "Uploading..." : "Submit for Verification"}
        </button>

      </div>

    </main>
  );
}
