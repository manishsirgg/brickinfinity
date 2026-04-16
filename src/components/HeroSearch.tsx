"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

type LocationOption = {
  id: string;
  name: string;
};

export default function HeroSearch() {
  const router = useRouter();

  const [listingType, setListingType] = useState<"Sale" | "Rent">("Sale");

  const [states, setStates] = useState<LocationOption[]>([]);
  const [cities, setCities] = useState<LocationOption[]>([]);

  const [stateId, setStateId] = useState("");
  const [cityId, setCityId] = useState("");

  const [propertyType, setPropertyType] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [bedrooms, setBedrooms] = useState("");

  const stateNameById = useMemo(
    () => new Map(states.map((item) => [item.id, item.name])),
    [states]
  );

  const cityNameById = useMemo(
    () => new Map(cities.map((item) => [item.id, item.name])),
    [cities]
  );

  const loadStates = useCallback(async () => {
    const { data } = await supabase
      .from("states")
      .select("id,name")
      .order("name");

    setStates((data as LocationOption[]) || []);
  }, []);

  const loadCities = useCallback(async (selectedStateId: string) => {
    const { data } = await supabase
      .from("cities")
      .select("id,name")
      .eq("state_id", selectedStateId)
      .order("name");

    setCities((data as LocationOption[]) || []);
  }, []);

  useEffect(() => {
    loadStates();
  }, [loadStates]);

  useEffect(() => {
    if (!stateId) {
      setCities([]);
      setCityId("");
      return;
    }

    loadCities(stateId);
  }, [stateId, loadCities]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();

    const min = minPrice.trim();
    const max = maxPrice.trim();

    if (min && max && Number(min) > Number(max)) {
      alert("Min price cannot be greater than max price");
      return;
    }

    const selectedStateName = stateNameById.get(stateId) || "";
    const selectedCityName = cityNameById.get(cityId) || "";

    const params = new URLSearchParams();

    if (selectedStateName) params.set("state", selectedStateName);
    if (selectedCityName) params.set("city", selectedCityName);
    if (propertyType) params.set("propertyType", propertyType);
    if (min) params.set("minPrice", min);
    if (max) params.set("maxPrice", max);
    if (bedrooms) params.set("bedrooms", bedrooms);

    const basePath = listingType === "Sale" ? "/buy" : "/rent";
    const url = params.toString() ? `${basePath}?${params.toString()}` : basePath;

    router.push(url);
  };

  return (
    <form
      onSubmit={handleSearch}
      className="bg-white rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.08)] border border-gray-200 p-8 space-y-6"
    >
      <div className="text-center">
        <p className="text-sm font-semibold text-gray-500 uppercase">Start Your Search</p>
      </div>

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
            className={`relative z-10 flex-1 py-2 text-sm font-semibold ${
              listingType === "Sale" ? "text-white" : "text-gray-700"
            }`}
          >
            Buy
          </button>

          <button
            type="button"
            onClick={() => setListingType("Rent")}
            className={`relative z-10 flex-1 py-2 text-sm font-semibold ${
              listingType === "Rent" ? "text-white" : "text-gray-700"
            }`}
          >
            Rent
          </button>
        </div>
      </div>

      <div className="border-t" />

      <div className="grid md:grid-cols-3 gap-4">
        <select
          value={stateId}
          onChange={(e) => {
            setStateId(e.target.value);
            setCityId("");
          }}
          className="input"
        >
          <option value="">Select State</option>
          {states.map((state) => (
            <option key={state.id} value={state.id}>
              {state.name}
            </option>
          ))}
        </select>

        <select
          value={cityId}
          disabled={!stateId}
          onChange={(e) => setCityId(e.target.value)}
          className="input"
        >
          <option value="">Select City</option>
          {cities.map((city) => (
            <option key={city.id} value={city.id}>
              {city.name}
            </option>
          ))}
        </select>

        <select
          value={propertyType}
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

        <select
          value={bedrooms}
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
          value={minPrice}
          onChange={(e) => setMinPrice(e.target.value)}
          className="input"
        />

        <input
          type="number"
          placeholder="Max Price"
          value={maxPrice}
          onChange={(e) => setMaxPrice(e.target.value)}
          className="input"
        />
      </div>

      <button
        type="submit"
        className="w-full bg-red-600 hover:bg-red-700 text-white py-3 rounded-xl font-semibold transition shadow-md"
      >
        Search Properties
      </button>
    </form>
  );
}
