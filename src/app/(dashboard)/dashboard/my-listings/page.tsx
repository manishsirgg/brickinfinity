"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { useRouter } from "next/navigation";

const supabase = createClient();

const PAGE_SIZE = 9;

export default function MyListingsPage() {

  const router = useRouter();

  const [loading,setLoading] = useState(true);
  const [properties,setProperties] = useState<any[]>([]);
  const [page,setPage] = useState(0);
  const [totalCount,setTotalCount] = useState(0);
  const [deletingId,setDeletingId] = useState<string | null>(null);

  const [statusFilter,setStatusFilter] = useState("all");
  const [search,setSearch] = useState("");

  const [stats,setStats] = useState({
    total:0,
    active:0,
    pending:0,
    rejected:0,
    draft:0,
    suspended:0
  });

  async function getProfileId(authId:string){
    const { data } = await supabase
      .from("users")
      .select("id")
      .eq("user_id",authId)
      .single();

    return data?.id;
  }

  const fetchListings = useCallback(async()=>{

    setLoading(true);

    try{

      const {data:{session}} =
        await supabase.auth.getSession();

      if(!session) return;

      const profileId =
        await getProfileId(session.user.id);

      if(!profileId) return;

      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let query =
        supabase
          .from("properties")
          .select(`
            id,
            slug,
            property_type,
            listing_type,
            price,
            status,
            rejection_reason,
            is_featured,
            views_count,
            created_at,
            property_images(image_url)
          `,{count:"exact"})
          .eq("seller_id",profileId)
          .is("deleted_at",null)
          .order("created_at",{ascending:false})
          .range(from,to);

      if(statusFilter !== "all"){
        query = query.eq("status",statusFilter);
      }

      const searchValue = search.trim();

      if(searchValue){
        query = query.ilike("property_type",`%${searchValue}%`);
      }

      const {data,count,error} = await query;

      if(error) throw error;

      setProperties(data || []);
      setTotalCount(count || 0);

      const {data:allStats} =
        await supabase
          .from("properties")
          .select("status")
          .eq("seller_id",profileId)
          .is("deleted_at",null);

      const total = allStats?.length || 0;

      setStats({
        total,
        active:allStats?.filter(p=>p.status==="active").length || 0,
        pending:allStats?.filter(p=>p.status==="pending").length || 0,
        rejected:allStats?.filter(p=>p.status==="rejected").length || 0,
        draft:allStats?.filter(p=>p.status==="draft").length || 0,
        suspended:allStats?.filter(p=>p.status==="suspended").length || 0
      });

    }catch(err){
      console.error(err);
    }finally{
      setLoading(false);
    }

  },[page,statusFilter,search]);

  useEffect(()=>{
    fetchListings();
  },[fetchListings]);

  const deleteProperty = async(id:string)=>{

    if(!confirm("Delete this property?")) return;

    setDeletingId(id);

    const previous = properties;

    setProperties(prev =>
      prev.filter(p => p.id !== id)
    );

    const {error} =
      await supabase
        .from("properties")
        .update({
          deleted_at:new Date().toISOString()
        })
        .eq("id",id);

    if(error){
      console.error(error);
      setProperties(previous);
    }

    setDeletingId(null);
    fetchListings();
  };

  const totalPages =
    Math.ceil(totalCount / PAGE_SIZE);

  function getBadge(status:string){

    switch(status){
      case "active": return "badge-success";
      case "pending": return "badge-warning";
      case "rejected": return "badge-danger";
      case "draft": return "badge-secondary";
      case "suspended": return "badge-secondary";
      default: return "badge-secondary";
    }
  }

  if(loading){
    return(
      <div className="container-custom py-20 text-center text-muted">
        Loading your listings...
      </div>
    );
  }

  return(

    <main className="container-custom py-12 md:py-20 space-y-12">

      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">

        <h1 className="text-2xl md:text-3xl font-semibold">
          My Listings
        </h1>

        <Button href="/dashboard/add-property">
          + Add Property
        </Button>

      </div>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-4 md:gap-6">

        <Card className="p-4 text-center">
          <p className="text-xs text-muted">Total</p>
          <p className="text-xl font-semibold">{stats.total}</p>
        </Card>

        <Card className="p-4 text-center">
          <p className="text-xs text-muted">Active</p>
          <p className="text-xl font-semibold text-green-600">
            {stats.active}
          </p>
        </Card>

        <Card className="p-4 text-center">
          <p className="text-xs text-muted">Pending</p>
          <p className="text-xl font-semibold text-yellow-600">
            {stats.pending}
          </p>
        </Card>

        <Card className="p-4 text-center">
          <p className="text-xs text-muted">Rejected</p>
          <p className="text-xl font-semibold text-red-600">
            {stats.rejected}
          </p>
        </Card>

        <Card className="p-4 text-center">
          <p className="text-xs text-muted">Draft</p>
          <p className="text-xl font-semibold text-gray-600">
            {stats.draft}
          </p>
        </Card>

        <Card className="p-4 text-center">
          <p className="text-xs text-muted">Suspended</p>
          <p className="text-xl font-semibold text-gray-600">
            {stats.suspended}
          </p>
        </Card>

      </div>

      <div className="flex flex-col md:flex-row gap-4">

        <select
          value={statusFilter}
          onChange={(e)=>{
            setPage(0);
            setStatusFilter(e.target.value);
          }}
          className="border px-3 py-2 rounded-md"
        >
          <option value="all">All</option>
          <option value="active">Active</option>
          <option value="pending">Pending</option>
          <option value="rejected">Rejected</option>
          <option value="draft">Draft</option>
          <option value="suspended">Suspended</option>
        </select>

        <input
          placeholder="Search property type..."
          value={search}
          onChange={(e)=>{
            setPage(0);
            setSearch(e.target.value);
          }}
          className="border px-3 py-2 rounded-md w-full md:w-64"
        />

      </div>

      {properties.length === 0 && (

        <Card className="text-center py-16 space-y-4">
          <p>No listings found.</p>
          <Button href="/dashboard/add-property">
            Add Your First Property
          </Button>
        </Card>

      )}

      <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-6">

        {properties.map(property=>{

          const image =
            property.property_images?.[0]?.image_url ||
            "/placeholder.jpg";

          const propertyUrl =
            `/property/${property.id}/${property.slug}`;

          return(

            <Card
  key={property.id}
  className="overflow-hidden hover:shadow-lg transition cursor-pointer"
>

<div
  onClick={()=>router.push(`/property/${property.id}/${property.slug}`)}
>

              <img
                src={image}
                className="h-52 w-full object-cover"
                alt="Property"
              />

              <div className="p-5 space-y-3">

                <p className="font-semibold">
                  {property.property_type} ({property.listing_type})
                </p>

                <p className="text-primary font-semibold">
                  ₹ {new Intl.NumberFormat("en-IN")
                    .format(property.price)}
                </p>

                <span className={getBadge(property.status)}>
                  {property.status}
                </span>

                <p className="text-xs text-muted">
                  Views: {property.views_count || 0}
                </p>

                <p className="text-xs text-muted">
                  Posted: {new Date(property.created_at)
                    .toLocaleDateString("en-IN")}
                </p>

                {property.rejection_reason && (
                  <p className="text-xs text-red-600">
                    Reason: {property.rejection_reason}
                  </p>
                )}

                <div
                  className="flex gap-3 flex-wrap mt-4"
                  onClick={(e)=>e.stopPropagation()}
                >

                  <Button
                    variant="secondary"
                    href={`/dashboard/edit/${property.id}`}
                  >
                    Edit
                  </Button>

                  <Button
                    variant="secondary"
                    href={propertyUrl}
                  >
                    View
                  </Button>

                  <Button
                    variant="danger"
                    disabled={deletingId === property.id}
                    onClick={()=>deleteProperty(property.id)}
                  >
                    {deletingId === property.id
                      ? "Deleting..."
                      : "Delete"}
                  </Button>

                </div>

              </div>

              </div>

            </Card>

          );

        })}

      </div>

      {totalPages > 1 && (

        <div className="flex justify-between items-center mt-12">

          <Button
            variant="secondary"
            disabled={page === 0}
            onClick={()=>setPage(page-1)}
          >
            Previous
          </Button>

          <span className="text-sm text-muted">
            Page {page+1} of {totalPages}
          </span>

          <Button
            variant="secondary"
            disabled={page+1 >= totalPages}
            onClick={()=>setPage(page+1)}
          >
            Next
          </Button>

        </div>

      )}

    </main>

  );

}
