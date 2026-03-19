"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Card from "@/components/ui/Card";
import Link from "next/link";

const supabase = createClient();

export default function SellerDashboard() {

  const [loading, setLoading] = useState(true);

  const [stats, setStats] = useState({
    totalListings: 0,
    activeListings: 0,
    pendingListings: 0,
    totalViews: 0,
    totalLeads: 0,
  });

  const [topProperty, setTopProperty] = useState<any>(null);
  const [recentLeads, setRecentLeads] = useState<any[]>([]);

  /* GRAPH STATES */

  const [viewsTrend, setViewsTrend] = useState<any[]>([]);
  const [leadsTrend, setLeadsTrend] = useState<any[]>([]);
  const [propertyPerformance, setPropertyPerformance] = useState<any[]>([]);

  useEffect(() => {
    loadDashboard();
  }, []);

  async function loadDashboard() {

    try {

      const { data: { session } } =
        await supabase.auth.getSession();

      if (!session) {
        setLoading(false);
        return;
      }

      /* PROFILE ID */

      const { data: profile } =
        await supabase
          .from("users")
          .select("id")
          .eq("user_id", session.user.id)
          .single();

      if (!profile) {
        setLoading(false);
        return;
      }

      const sellerId = profile.id;

      /* PROPERTIES */

      const { data: properties } =
        await supabase
          .from("properties")
          .select(`
            id,
            property_type,
            slug,
            views_count,
            status,
            created_at,
            property_images(image_url)
          `)
          .eq("seller_id", sellerId)
          .is("deleted_at", null);

      /* LEADS */

      const { data: leads } =
        await supabase
          .from("leads")
          .select(`
            id,
            buyer_name,
            created_at,
            properties(
              id,
              slug,
              property_type,
              status
            )
          `)
          .eq("seller_id", sellerId)
          .order("created_at", { ascending: false })
          .limit(5);

      const { count: leadCount } =
        await supabase
          .from("leads")
          .select("id", { count: "exact", head: true })
          .eq("seller_id", sellerId);

      /* ===== STATS CALC ===== */

      const totalListings = properties?.length || 0;

      const activeListings =
        properties?.filter(p => p.status === "active").length || 0;

      const pendingListings =
        properties?.filter(
          p => p.status === "pending" || p.status === "rejected"
        ).length || 0;

      const totalViews =
        properties
          ?.filter(p => p.status === "active")
          .reduce((sum, p) => sum + (p.views_count || 0), 0) || 0;

      const totalLeads = leadCount || 0;

      const top =
        properties
          ?.filter(p => p.status === "active")
          .sort((a, b) => (b.views_count || 0) - (a.views_count || 0))[0];

      setStats({
        totalListings,
        activeListings,
        pendingListings,
        totalViews,
        totalLeads,
      });

      setTopProperty(top || null);

      /* ===== RECENT LEADS SAFE ===== */

      const filteredLeads =
        (leads || []).filter((l: any) => {
          const prop =
            Array.isArray(l.properties)
              ? l.properties[0]
              : l.properties;

          return prop?.status === "active";
        });

      setRecentLeads(filteredLeads);

      /* ================= PERFORMANCE GRAPH ================= */

      const last7Days = new Date();
      last7Days.setDate(last7Days.getDate() - 7);

      /* Views Trend (mock from property created date + total views distribution) */

      const viewsMap: any = {};

      properties
        ?.filter(p => p.status === "active")
        .forEach(p => {

          const d =
            new Date(p.created_at)
              .toLocaleDateString("en-IN");

          viewsMap[d] =
            (viewsMap[d] || 0) + (p.views_count || 0);

        });

      setViewsTrend(
        Object.entries(viewsMap).map(([date, views]) => ({
          date,
          views
        }))
      );

      /* Leads Trend */

      const { data: allLeads } =
        await supabase
          .from("leads")
          .select("created_at")
          .eq("seller_id", sellerId)
          .gte("created_at", last7Days.toISOString());

      const leadsMap: any = {};

      allLeads?.forEach(l => {

        const d =
          new Date(l.created_at)
            .toLocaleDateString("en-IN");

        leadsMap[d] =
          (leadsMap[d] || 0) + 1;

      });

      setLeadsTrend(
        Object.entries(leadsMap).map(([date, leads]) => ({
          date,
          leads
        }))
      );

      /* Property Wise Performance */

      if (!properties) {
  setPropertyPerformance([]);
} else {

  const performance =
    properties
      .filter((p: any) => p.status === "active")
      .map((p: any) => ({
        id: p.id,
        slug: p.slug,
        type: p.property_type,
        views: p.views_count || 0
      }));

  setPropertyPerformance(performance);
}

    } catch (err) {

      console.error("Dashboard load error:", err);

    } finally {

      setLoading(false);

    }
  }

  if (loading) {
    return (
      <div className="container-custom py-20 text-center text-muted">
        Loading dashboard...
      </div>
    );
  }

  const conversionRate =
    stats.totalViews
      ? ((stats.totalLeads / stats.totalViews) * 100).toFixed(2)
      : "0.00";

  return (

    <main className="container-custom py-12 md:py-20 space-y-12">

      <h1 className="text-2xl md:text-3xl font-semibold">
        Seller Analytics
      </h1>

      {/* STATS */}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 md:gap-6">

        <Card className="p-5 text-center">
          <p className="text-sm text-muted">Total Listings</p>
          <p className="text-xl font-semibold">{stats.totalListings}</p>
        </Card>

        <Card className="p-5 text-center">
          <p className="text-sm text-muted">Active Listings</p>
          <p className="text-xl font-semibold text-green-600">
            {stats.activeListings}
          </p>
        </Card>

        <Card className="p-5 text-center">
          <p className="text-sm text-muted">Needs Action</p>
          <p className="text-xl font-semibold text-yellow-600">
            {stats.pendingListings}
          </p>
        </Card>

        <Card className="p-5 text-center">
          <p className="text-sm text-muted">Total Views</p>
          <p className="text-xl font-semibold">
            {new Intl.NumberFormat("en-IN").format(stats.totalViews)}
          </p>
        </Card>

        <Card className="p-5 text-center">
          <p className="text-sm text-muted">Conversion Rate</p>
          <p className="text-xl font-semibold text-primary">
            {conversionRate}%
          </p>
        </Card>

      </div>

      {/* TOP PROPERTY */}

      {topProperty && (

        <section className="space-y-4">

          <h2 className="text-lg font-semibold">
            Top Performing Property
          </h2>

          <Card className="flex gap-4 p-5 items-center">

            <img
              src={
                topProperty.property_images?.[0]?.image_url ||
                "/placeholder.jpg"
              }
              className="w-24 h-24 object-cover rounded-md"
            />

            <div>

              <p className="font-medium">
                {topProperty.property_type}
              </p>

              <p className="text-sm text-muted">
                Views: {topProperty.views_count}
              </p>

              <Link
                href={`/property/${topProperty.id}/${topProperty.slug}`}
                className="text-primary text-sm"
              >
                View Listing →
              </Link>

            </div>

          </Card>

        </section>

      )}

      {/* PROPERTY PERFORMANCE */}

      <section className="space-y-4">

        <h2 className="text-lg font-semibold">
          Property Performance
        </h2>

        <div className="space-y-3">

          {propertyPerformance.map(p => (

            <Card key={p.id} className="p-4 flex justify-between">

              <Link
                href={`/property/${p.id}/${p.slug}`}
                className="font-medium text-primary"
              >
                {p.type}
              </Link>

              <div className="text-sm text-muted">
                Views: {p.views}
              </div>

            </Card>

          ))}

        </div>

      </section>

      {/* RECENT LEADS */}

      <section className="space-y-4">

        <h2 className="text-lg font-semibold">
          Recent Leads
        </h2>

        {recentLeads.length === 0 && (
          <Card className="p-6 text-center text-muted">
            No leads yet.
          </Card>
        )}

        {recentLeads.map((lead: any) => {

          const prop =
            Array.isArray(lead.properties)
              ? lead.properties[0]
              : lead.properties;

          return (

            <Card key={lead.id} className="p-5">

              <p className="font-medium">
                {lead.buyer_name}
              </p>

              <p className="text-sm text-muted">

                Interested in{" "}

                <Link
                  href={`/property/${prop?.id}/${prop?.slug}`}
                  className="text-primary"
                >
                  {prop?.property_type}
                </Link>

              </p>

              <p className="text-xs text-muted mt-1">
                {new Date(lead.created_at)
                  .toLocaleString("en-IN")}
              </p>

            </Card>

          );

        })}

      </section>

    </main>

  );
}