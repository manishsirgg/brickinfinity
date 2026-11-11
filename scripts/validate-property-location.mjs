import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const nativeRequire = createRequire(import.meta.url);
let client;
const modules = {};
function load(path) {
  const exports = {};
  const { outputText } = ts.transpileModule(fs.readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  });
  vm.runInNewContext(outputText, { exports, URLSearchParams, console, process: { env: {} }, require(name) {
    if (name === "@/lib/supabase/service") return { createServiceClient: () => client };
    if (name === "@/components/property/PropertyCard") return { default: ({ property }) => React.createElement("div", { "data-property": property.id }) };
    if (name === "@/lib/property-featured") return { sortFeaturedPropertiesFirst: data => data };
    if (name === "next/link") return { default: props => React.createElement("a", props) };
    return modules[name] || nativeRequire(name);
  } });
  return exports;
}
modules["@/components/property/PropertySortControl"] = { default: () => null };
modules["@/components/property/PropertySearchFilters"] = { default: () => null };
modules["@/lib/property-result-options"] = load("src/lib/property-result-options.ts");
modules["@/lib/property-location"] = load("src/lib/property-location.ts");
modules["@/lib/property-search"] = load("src/lib/property-search.ts");
const Page = load("src/app/properties/page.tsx").default;
const fixtures = {
  states: [{ id: "mp", name: "Madhya Pradesh" }, { id: "other-state", name: "Other state" }],
  cities: [{ id: "chh", name: "Chhatarpur", state_id: "mp" }, { id: "other-city", name: "Other city", state_id: "mp" }, { id: "outside", name: "Outside", state_id: "other-state" }],
  localities: [{ id: "road", name: "Narayan Pura Road", city_id: "chh" }, { id: "other-road", name: "Other road", city_id: "chh" }],
  properties: [
    ...Array.from({ length: 13 }, (_, index) => ({ id: `road-${index}`, city_id: "chh", locality_id: "road", listing_type: index % 2 ? "Rent" : "Sale" })),
    { id: "city-only", city_id: "chh", locality_id: "other-road", listing_type: "Rent" },
    { id: "state-only", city_id: "other-city", listing_type: "Sale" },
    { id: "excluded", city_id: "outside", listing_type: "Rent" },
  ].map((item, index) => ({ ...item, created_at: `2026-11-${String(index + 1).padStart(2, "0")}`, availability_status: "unknown", status: "active", verification_status: "approved", deleted_at: null })),
};
const calls = [];
client = { from(table) {
  const filters = [];
  const orders = [];
  let columns = "", range;
  const query = new Proxy({}, { get(_, key) {
    if (key === "then") return resolve => {
      let rows = fixtures[table].filter(row => filters.every(([column, value, op]) => {
        const actual = column === "cities.state_id" ? fixtures.cities.find(city => city.id === row.city_id)?.state_id : row[column];
        if (column === "cities.state_id") assert.ok(columns.includes("cities!inner"), "state filters must restrict parent properties");
        return op === "gte" ? actual >= value : op === "lte" ? actual <= value : op === "contains" ? value.every(item => (actual || []).includes(item)) : op === "in" ? value.includes(actual) : op === "ilike" ? actual.toLowerCase() === value.toLowerCase() : actual === value;
      }));
      const count = rows.length;
      rows.sort((a, b) => {
        for (const [column, options] of orders) {
          const difference = typeof a[column] === "string" ? a[column].localeCompare(b[column]) : (a[column] || 0) - (b[column] || 0);
          if (difference) return options?.ascending === false ? -difference : difference;
        }
        return 0;
      });
      if (range) rows = rows.slice(range[0], range[1] + 1);
      resolve({ data: rows, count, error: null });
    };
    return (...args) => {
      calls.push([table, key, ...args]);
      if (key === "select") columns = args[0];
      if (["eq", "is", "ilike", "in", "gte", "lte", "contains"].includes(key)) filters.push([args[0], args[1], key]);
      if (key === "range") range = args;
      if (key === "order") orders.push(args);
      if (key === "maybeSingle") return Promise.resolve({ data: fixtures[table].find(row => filters.every(([column, value, op]) => op === "ilike" ? row[column].toLowerCase() === value.toLowerCase() : row[column] === value)) || null, error: null });
      return query;
    };
  } });
  return query;
} };
for (const [filters, count, label] of [
  [{ state_id: "mp" }, 15, "Madhya Pradesh"],
  [{ state_id: "mp", city_id: "chh" }, 14, "Chhatarpur"],
  [{ state_id: "mp", city_id: "chh", locality_id: "road" }, 13, "Narayan Pura Road"],
  [{ state: "madhya pradesh", city: "chhatarpur" }, 14, "Chhatarpur"],
]) {
  const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve(filters) }));
  assert.ok(html.includes(`${count} properties found.`));
  assert.ok(html.includes(`Properties in ${label}`));
  assert.ok(!html.includes('data-property="excluded"'));
  assert.ok(html.includes("Next"), "all matching listings must be reachable");
}
const secondPage = renderToStaticMarkup(await Page({ searchParams: { state_id: "mp", city_id: "chh", locality_id: "road", page: "2" } }));
assert.ok(secondPage.includes('data-property="road-0"'));
assert.ok(secondPage.includes("state_id=mp&amp;city_id=chh&amp;locality_id=road&amp;page=1"));
const unknown = renderToStaticMarkup(await Page({ searchParams: { locality_id: "unknown" } }));
assert.ok(unknown.includes("0 properties found."));
assert.ok(!unknown.includes("data-property="));
assert.ok(!calls.some(call => call[1] === "eq" && call[2] === "listing_type"), "location browsing must include sale and rent");
console.log("Location result checks passed: state, city, locality, exact names, pagination, unknown locations, and sale/rent inclusion.");

const Breadcrumb = load("src/components/property/LocationBreadcrumb.tsx").default;
const breadcrumb = renderToStaticMarkup(React.createElement(Breadcrumb, {
  state: fixtures.states[0], city: fixtures.cities[0], locality: fixtures.localities[0],
}));
assert.ok(breadcrumb.includes('href="/properties?state_id=mp"'));
assert.ok(breadcrumb.includes('href="/properties?state_id=mp&amp;city_id=chh"'));
assert.ok(breadcrumb.includes('href="/properties?state_id=mp&amp;city_id=chh&amp;locality_id=road"'));
assert.ok(!breadcrumb.includes("/properties/buy"));
console.log("Location breadcrumb link checks passed.");

fixtures.properties.forEach((property, index) => Object.assign(property, {
  price: (index + 1) * 1000, built_up_area: (index + 1) * 100,
  bedrooms: index % 2 ? 2 : 1, bathrooms: 1,
  furnishing_status: index % 2 ? "Fully Furnished" : "Unfurnished",
  amenities: index % 2 ? ["Gym", "Power Backup"] : ["Gym"],
  created_at: `2026-11-${String(index + 1).padStart(2, "0")}`, updated_at: `2026-11-${String(index + 1).padStart(2, "0")}`,
}));
const filtered = renderToStaticMarkup(await Page({ searchParams: {
  state_id: "mp", min_price: "2000", max_price: "6000", min_area: "200", max_area: "600",
  bedrooms: "2", bathrooms: "1", furnishing: "Fully Furnished", amenities: ["Gym", "Power Backup"], sort: "price_desc",
} }));
assert.ok(filtered.includes("3 properties found."));
assert.ok(filtered.indexOf('data-property="road-5"') < filtered.indexOf('data-property="road-3"'));
assert.ok(filtered.indexOf('data-property="road-3"') < filtered.indexOf('data-property="road-1"'));
for (const sort of ["price_asc", "price_desc", "area_asc", "area_desc", "newest", "updated"]) {
  const html = renderToStaticMarkup(await Page({ searchParams: { state_id: "mp", sort } }));
  const ids = [...html.matchAll(/data-property="([^"]+)"/g)].map(match => match[1]);
  assert.equal(ids[0], sort.endsWith("_asc") ? "road-0" : "state-only");
  assert.ok(html.includes(`sort=${sort}&amp;page=2`));
}
for (const params of [{ min_price: "9000", max_price: "1000" }, { min_area: "-1" }, { furnishing: "made up" }]) {
  const html = renderToStaticMarkup(await Page({ searchParams: params }));
  assert.ok(html.includes('role="alert"'));
  assert.ok(!html.includes("data-property="));
}
modules["@/app/properties/page"] = { default: Page };
for (const route of ["buy", "rent", "properties/buy", "properties/rent"]) {
  const Wrapper = load(`src/app/${route}/page.tsx`).default;
  const html = renderToStaticMarkup(await Wrapper({ searchParams: Promise.resolve({ state_id: "mp", max_price: "2500", sort: "price_asc" }) }));
  assert.ok(html.includes("1 properties found."));
  assert.ok(html.includes(`data-property="${route.endsWith("buy") ? "road-0" : "road-1"}"`));
}
console.log("Search filters and sorting checks passed: combined filters, repeated amenities, ordering before pagination, invalid ranges and shared Buy/Rent routes.");

fixtures.properties.push({ ...fixtures.properties[0], id: "closed-property", availability_status: "rented" });
fixtures.properties[0].availability_status = "available";
fixtures.properties[0].availability_confirmed_at = new Date().toISOString();
const available = renderToStaticMarkup(await Page({ searchParams: { state_id: "mp", availability: "available", confirmed_recent: "1" } }));
assert.ok(available.includes("1 properties found."));
assert.ok(available.includes('data-property="road-0"'));
assert.ok(!available.includes('data-property="closed-property"'));
console.log("Closed availability exclusion and recent-confirmation filter checks passed.");
