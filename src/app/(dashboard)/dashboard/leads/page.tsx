"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Link from "next/link";

const supabase = createClient();

const PAGE_SIZE = 10;

export default function LeadsPage() {

  const [loading,setLoading] = useState(true);
  const [leads,setLeads] = useState<any[]>([]);
  const [page,setPage] = useState(0);
  const [totalCount,setTotalCount] = useState(0);
  const [actionLoading,setActionLoading] =
    useState<string | null>(null);

  /* ================= FETCH LEADS ================= */

  const fetchLeads = useCallback(async()=>{

    setLoading(true);

    try{

      const {data:{session}} =
        await supabase.auth.getSession();

      if(!session) return;

      const { data: profile } =
        await supabase
          .from("users")
          .select("id")
          .eq("user_id", session.user.id)
          .single();

      if(!profile) return;

      const sellerId = profile.id;

      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const {data,error} =
        await supabase
          .from("leads")
          .select(`
            id,
            buyer_name,
            buyer_phone,
            buyer_email,
            message,
            contacted,
            status,
            created_at,
            properties(
              id,
              slug,
              property_type,
              price,
              status,
              property_images(image_url)
            )
          `)
          .eq("seller_id",sellerId)
          .order("created_at",{ascending:false})
          .range(from,to);

      if(error) throw error;

      /* ⭐ FILTER ONLY ACTIVE PROPERTY LEADS */

      const filtered =
        (data || []).filter((l:any)=>{
          const p =
            Array.isArray(l.properties)
              ? l.properties[0]
              : l.properties;

          return p?.status === "active";
        });

      setLeads(filtered);
      setTotalCount(filtered.length);

    }catch(err){

      console.error("Leads fetch error:",err);

    }finally{

      setLoading(false);

    }

  },[page]);

  useEffect(()=>{
    fetchLeads();
  },[fetchLeads]);


  /* ================= MARK CONTACTED ================= */

  const markAsContacted = async(leadId:string)=>{

    setActionLoading(leadId);

    const prev = [...leads];

    setLeads(prevLeads =>
      prevLeads.map(lead =>
        lead.id === leadId
          ? {...lead,contacted:true,status:"contacted"}
          : lead
      )
    );

    const {error} =
      await supabase
        .from("leads")
        .update({
          contacted:true,
          status:"contacted"
        })
        .eq("id",leadId);

    if(error){

      console.error(error);
      setLeads(prev);

    }

    setActionLoading(null);
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  /* ================= LOADING ================= */

  if(loading){

    return(
      <div className="container-custom py-20 text-center text-muted">
        Loading leads...
      </div>
    );
  }

  return(

    <main className="container-custom py-12 md:py-20">

      <h1 className="text-2xl md:text-3xl font-semibold mb-10 md:mb-12">
        My Leads
      </h1>

      {leads.length === 0 && (

        <Card className="text-center py-16 space-y-4">

          <p className="text-muted text-sm">
            No leads yet.
          </p>

          <Link href="/dashboard/my-listings">
            <Button variant="secondary">
              View My Listings
            </Button>
          </Link>

        </Card>

      )}

      <div className="space-y-6">

        {leads.map((lead)=>{

          const property =
            Array.isArray(lead.properties)
              ? lead.properties[0]
              : lead.properties;

          const image =
            property?.property_images?.[0]?.image_url ||
            "/placeholder.jpg";

          const whatsappLink = lead.buyer_phone
            ? `https://wa.me/91${lead.buyer_phone.replace(/\D/g,"")}`
            : null;

          const hoursAgo =
            Math.floor(
              (Date.now() -
              new Date(lead.created_at).getTime())
              / (1000*60*60)
            );

          return(

            <Card key={lead.id} className="space-y-6">

              {/* PROPERTY INFO */}

              <div className="flex gap-4">

                <img
                  src={image}
                  className="w-24 h-24 object-cover rounded-md"
                />

                <div className="flex-1">

                  <Link
                    href={`/property/${property?.id}/${property?.slug}`}
                    className="font-semibold hover:underline"
                  >
                    {property?.property_type}
                  </Link>

                  <p className="text-primary font-semibold">

                    ₹ {new Intl.NumberFormat("en-IN")
                      .format(property?.price || 0)}

                  </p>

                  <p className="text-xs text-muted mt-1">

                    {new Date(lead.created_at)
                      .toLocaleString("en-IN",{
                        dateStyle:"medium",
                        timeStyle:"short"
                      })}

                  </p>

                  <p className="text-xs text-gray-500">
                    {hoursAgo} hrs ago
                  </p>

                </div>

              </div>

              {/* BUYER INFO */}

              <div className="space-y-1 text-sm">

                <p>
                  <strong>Name:</strong> {lead.buyer_name}
                </p>

                <p>
                  <strong>Phone:</strong> {lead.buyer_phone}
                </p>

                {lead.buyer_email && (

                  <p>
                    <strong>Email:</strong> {lead.buyer_email}
                  </p>

                )}

                {lead.message && (

                  <p className="pt-2 border-t mt-2">
                    <strong>Message:</strong> {lead.message}
                  </p>

                )}

                <div className="mt-2">
                  <span className={
                    lead.status === "contacted"
                      ? "badge-success"
                      : "badge-warning"
                  }>
                    {lead.status || "new"}
                  </span>
                </div>

              </div>

              {/* ACTIONS */}

              <div className="flex flex-wrap gap-3">

                {whatsappLink && (

                  <a
                    href={whatsappLink}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Button variant="secondary">
                      WhatsApp
                    </Button>
                  </a>

                )}

                {lead.buyer_phone && (

                  <a href={`tel:${lead.buyer_phone}`}>
                    <Button variant="secondary">
                      Call
                    </Button>
                  </a>

                )}

                {!lead.contacted ? (

                  <Button
                    disabled={actionLoading === lead.id}
                    onClick={()=>markAsContacted(lead.id)}
                  >

                    {actionLoading === lead.id
                      ? "Updating..."
                      : "Mark as Contacted"}

                  </Button>

                ) : (

                  <span className="badge-success">
                    Contacted
                  </span>

                )}

              </div>

            </Card>

          );

        })}

      </div>

      {/* PAGINATION */}

      {totalPages > 1 && (

        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mt-12">

          <Button
            variant="secondary"
            disabled={page === 0}
            onClick={()=>setPage(page - 1)}
          >
            Previous
          </Button>

          <span className="text-sm text-muted">
            Page {page + 1} of {totalPages}
          </span>

          <Button
            variant="secondary"
            disabled={page + 1 >= totalPages}
            onClick={()=>setPage(page + 1)}
          >
            Next
          </Button>

        </div>

      )}

    </main>

  );
}