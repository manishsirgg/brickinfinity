"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface Props {
  propertyId: string;
  sellerId: string;
  sellerName: string;
}

export default function StickyContactPanel({
  propertyId,
  sellerId,
  sellerName,
}: Props) {

  const router = useRouter();
  const supabase = createClient();

  const [name,setName] = useState("");
  const [phone,setPhone] = useState("");
  const [email,setEmail] = useState("");
  const [message,setMessage] = useState("");

  const [loading,setLoading] = useState(false);
  const [success,setSuccess] = useState("");
  const [error,setError] = useState("");

  const [sellerPhone,setSellerPhone] = useState<string | null>(null);
  const [revealed,setRevealed] = useState(false);

  const propertyUrl =
    typeof window !== "undefined"
      ? window.location.href
      : "";

  /* ================= PHONE VALIDATION ================= */

  const isValidPhone = (p:string)=>{
    return /^[6-9]\d{9}$/.test(p);
  };

  /* ================= PROPERTY STATUS CHECK ================= */

  const checkPropertyActive = async () => {

    const { data } = await supabase
      .from("properties")
      .select("status, deleted_at")
      .eq("id", propertyId)
      .maybeSingle();

    if (!data) return false;

    return data.status === "active" && !data.deleted_at;
  };

  /* ================= SEND LEAD ================= */

  const sendLead = async () => {

    const isActive = await checkPropertyActive();

    if (!isActive) {
      throw new Error("Property not available");
    }

    const res = await fetch("/api/leads",{
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body:JSON.stringify({
        property_id:propertyId,
        seller_id:sellerId,
        name,
        phone,
        email,
        message,
        source:"contact_panel"
      })
    });

    if (res.status === 401) {
      router.push("/login");
      return;
    }

    if(!res.ok){
      throw new Error("Lead failed");
    }

  };

  /* ================= FORM SUBMIT ================= */

  const handleSubmit = async (e:React.FormEvent) => {

    e.preventDefault();

    if (loading) return;

    setError("");
    setSuccess("");

    if(!name || !phone){
      setError("Please enter your name and phone number.");
      return;
    }

    if(!isValidPhone(phone)){
      setError("Enter valid 10 digit mobile number.");
      return;
    }

    try{

      setLoading(true);

      await sendLead();

      setSuccess("Your enquiry has been sent successfully.");

      setName("");
      setPhone("");
      setEmail("");
      setMessage("");

    }catch(err:any){

      if (err.message === "Property not available") {
        setError("This property is not accepting enquiries.");
      } else {
        setError("Something went wrong. Please try again.");
      }

    }finally{

      setLoading(false);

    }

  };

  /* ================= PHONE REVEAL ================= */

  const revealPhone = async () => {

    if (loading) return;

    setError("");
    setSuccess("");

    if(revealed){
      setSuccess("Seller number already revealed.");
      return;
    }

    if(!name || !phone){
      setError("Enter your name and phone to reveal seller number.");
      return;
    }

    if(!isValidPhone(phone)){
      setError("Enter valid 10 digit mobile number.");
      return;
    }

    try{

      setLoading(true);

      await sendLead();

      const revealRes = await fetch("/api/leads/reveal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          property_id: propertyId,
          buyer_phone: phone
        })
      });

      if (!revealRes.ok) {
        throw new Error("Reveal failed");
      }

      const payload = await revealRes.json();
      const revealedPhone = payload?.phone;

      if(!revealedPhone){
        setError("Seller phone cannot be revealed now.");
        return;
      }

      setSellerPhone(revealedPhone);
      setRevealed(true);

      setSuccess("Seller number revealed.");

    }catch{

      setError("Unable to reveal phone. Please try later.");

    }finally{

      setLoading(false);

    }

  };

  /* ================= WHATSAPP ================= */

  const whatsappMessage = encodeURIComponent(
`Hello ${sellerName},

I found your property on BrickInfinity.

${propertyUrl}

Please share more details.`
  );

  const formattedSellerPhone =
    sellerPhone && sellerPhone.startsWith("91")
      ? sellerPhone
      : sellerPhone
      ? `91${sellerPhone}`
      : null;

  const whatsappLink =
    formattedSellerPhone
      ? `https://wa.me/${formattedSellerPhone}?text=${whatsappMessage}`
      : "#";

  return (

    <div className="bg-surface border border-border rounded-lg p-6 shadow-soft sticky top-24 space-y-4">

      <h3 className="text-lg font-semibold">
        Contact Seller
      </h3>

      {success && (
        <div className="text-green-600 text-sm">
          {success}
        </div>
      )}

      {error && (
        <div className="text-red-600 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3">

        <input
          value={name}
          onChange={(e)=>setName(e.target.value)}
          placeholder="Your Name"
          className="w-full border p-3 rounded-md"
        />

        <input
          type="tel"
          value={phone}
          onChange={(e)=>setPhone(e.target.value)}
          placeholder="Phone Number"
          className="w-full border p-3 rounded-md"
        />

        <input
          type="email"
          value={email}
          onChange={(e)=>setEmail(e.target.value)}
          placeholder="Email (optional)"
          className="w-full border p-3 rounded-md"
        />

        <textarea
          rows={3}
          value={message}
          onChange={(e)=>setMessage(e.target.value)}
          placeholder="Message"
          className="w-full border p-3 rounded-md"
        />

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-primary text-white py-3 rounded-md"
        >
          {loading ? "Sending..." : "Send Enquiry"}
        </button>

      </form>

      {!sellerPhone && (
        <button
          onClick={revealPhone}
          disabled={loading}
          className="w-full border py-3 rounded-md font-medium"
        >
          {loading ? "Processing..." : "Reveal Seller Phone"}
        </button>
      )}

      {sellerPhone && (
        <div className="text-center font-semibold text-lg">
          📞 {sellerPhone}
        </div>
      )}

      {sellerPhone && (
        <a
          href={`tel:${sellerPhone}`}
          className="block text-center border py-3 rounded-md font-medium"
        >
          Call Seller
        </a>
      )}

      <a
        href={sellerPhone ? whatsappLink : "#"}
        onClick={(e)=>{
          if(!sellerPhone){
            e.preventDefault();
            setError("Please reveal seller phone first.");
          }
        }}
        target="_blank"
        className={`block text-center text-white py-3 rounded-md font-medium
        ${
          sellerPhone
          ? "bg-[#25D366]"
          : "bg-gray-400 cursor-not-allowed"
        }`}
      >
        Chat on WhatsApp
      </a>

      <p className="text-xs text-muted text-center">
        Your details are safe. Seller will contact you directly.
      </p>

    </div>

  );
}
