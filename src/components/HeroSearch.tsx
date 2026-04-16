"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

export default function HeroSearch() {

  const router = useRouter();

  const [listingType, setListingType] = useState<"Sale" | "Rent">("Sale");

  const [states,setStates] = useState<any[]>([]);
  const [cities,setCities] = useState<any[]>([]);

  const [stateId,setStateId] = useState("");
  const [cityId,setCityId] = useState("");

  const [propertyType, setPropertyType] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [bedrooms, setBedrooms] = useState("");

  const loadStates = useCallback(async()=>{
    const { data } =
      await supabase
        .from("states")
        .select("id,name")
        .order("name");

    if(data) setStates(data);
  },[]);

  const loadCities = useCallback(async()=>{
    const { data } =
      await supabase
        .from("cities")
        .select("id,name")
        .eq("state_id", stateId)
        .order("name");

    if(data) setCities(data);
  },[stateId]);

  useEffect(()=>{
    loadStates();
  },[loadStates]);

  useEffect(()=>{
    if(stateId) {
      loadCities();
      return;
    }

    setCities([]);
  },[stateId, loadCities]);

  function getSelectedName(
    items: Array<{ id: string; name: string }>,
    id: string
  ) {
    if (!id) return "";
    return items.find((item) => item.id === id)?.name || "";
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();

    if (minPrice && maxPrice && Number(minPrice) > Number(maxPrice)) {
      alert("Min price cannot be greater than max price");
      return;
    }

    const selectedStateName = getSelectedName(states, stateId);
    const selectedCityName = getSelectedName(cities, cityId);

    const params = new URLSearchParams();

    if (selectedStateName) params.set("state", selectedStateName);
    if (selectedCityName) params.set("city", selectedCityName);
    if (propertyType) params.set("propertyType", propertyType);
    if (minPrice) params.set("minPrice", minPrice);
    if (maxPrice) params.set("maxPrice", maxPrice);
    if (bedrooms) params.set("bedrooms", bedrooms);

    const basePath = listingType === "Sale" ? "/buy" : "/rent";

    const url = params.toString()
      ? `${basePath}?${params.toString()}`
      : basePath;

    router.push(url);
  };

  return (
    <form
      onSubmit={handleSearch}
      data-testid="hero-search-form"
      className="bg-white rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.08)] border border-gray-200 p-8 space-y-6"
    >

      <div className="text-center">
        <p className="text-sm font-semibold text-gray-500 uppercase">
          Start Your Search
        </p>
      </div>

      {/* Toggle */}
      <div className="flex justify-center">
        <div className="relative flex bg-gray-200 rounded-full p-1 w-full max-w-xs">

          <div
            className={`absolute top-1 bottom-1 w-1/2 bg-red-600 rounded-full transition-all duration-300 ${
              listingType === "Sale" ? "left-1" : "left-1/2"
            }`}
          />

          <button
            type="button"
            onClick={() => setListingType("Sale")}
            data-testid="hero-search-buy-toggle"
            className={`relative z-10 flex-1 py-2 text-sm font-semibold ${
              listingType === "Sale" ? "text-white" : "text-gray-700"
            }`}
          >
            Buy
          </button>

          <button
            type="button"
            onClick={() => setListingType("Rent")}
            data-testid="hero-search-rent-toggle"
            className={`relative z-10 flex-1 py-2 text-sm font-semibold ${
              listingType === "Rent" ? "text-white" : "text-gray-700"
            }`}
          >
            Rent
          </button>

        </div>
      </div>

      <div className="border-t" />

      {/* Filters */}
      <div className="grid md:grid-cols-3 gap-4">

        {/* STATE */}
        <select
          value={stateId}
          data-testid="hero-search-state"
          onChange={(e)=>{
            setStateId(e.target.value);
            setCityId("");
          }}
          className="input"
        >
          <option value="">Select State</option>

          {states.map((s)=>(
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>

        {/* CITY */}
        <select
          value={cityId}
          data-testid="hero-search-city"
          disabled={!stateId}
          onChange={(e)=>setCityId(e.target.value)}
          className="input"
        >
          <option value="">Select City</option>

          {cities.map((c)=>(
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        {/* PROPERTY TYPE */}
        <select
          value={propertyType}
          data-testid="hero-search-property-type"
          onChange={(e) => setPropertyType(e.target.value)}
          className="input"
        >
          <option value="">Property Type</option>
          <option>Apartment</option>
          <option>Villa</option>
          <option>Plot</option>
          <option>Office</option>
          <option>Commercial</option>
        </select>

        {/* BEDROOMS */}
        <select
          value={bedrooms}
          data-testid="hero-search-bedrooms"
          onChange={(e) => setBedrooms(e.target.value)}
          className="input"
        >
          <option value="">Bedrooms</option>
          <option>1</option>
          <option>2</option>
          <option>3</option>
          <option>4</option>
          <option>5</option>
        </select>

        <input
          type="number"
          placeholder="Min Price"
          data-testid="hero-search-min-price"
          value={minPrice}
          onChange={(e) => setMinPrice(e.target.value)}
          className="input"
        />

        <input
          type="number"
          placeholder="Max Price"
          data-testid="hero-search-max-price"
          value={maxPrice}
          onChange={(e) => setMaxPrice(e.target.value)}
          className="input"
        />

      </div>

      <button
        type="submit"
        data-testid="hero-search-submit"
        className="w-full bg-red-600 hover:bg-red-700 text-white py-3 rounded-xl font-semibold transition shadow-md"
      >
        Search Properties
      </button>

    </form>
  );
}
