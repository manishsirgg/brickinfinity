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
  ].map(item => ({ ...item, status: "active", verification_status: "approved", deleted_at: null })),
};
const calls = [];
client = { from(table) {
  const filters = [];
  let columns = "", range;
  const query = new Proxy({}, { get(_, key) {
    if (key === "then") return resolve => {
      let rows = fixtures[table].filter(row => filters.every(([column, value, op]) => {
        const actual = column === "cities.state_id" ? fixtures.cities.find(city => city.id === row.city_id)?.state_id : row[column];
        if (column === "cities.state_id") assert.ok(columns.includes("cities!inner"), "state filters must restrict parent properties");
        return op === "in" ? value.includes(actual) : op === "ilike" ? actual.toLowerCase() === value.toLowerCase() : actual === value;
      }));
      const count = rows.length;
      if (range) rows = rows.slice(range[0], range[1] + 1);
      resolve({ data: rows, count, error: null });
    };
    return (...args) => {
      calls.push([table, key, ...args]);
      if (key === "select") columns = args[0];
      if (["eq", "is", "ilike", "in"].includes(key)) filters.push([args[0], args[1], key]);
      if (key === "range") range = args;
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
  assert.ok(html.includes(`${count} verified properties found.`));
  assert.ok(html.includes(`Properties in ${label}`));
  assert.ok(!html.includes('data-property="excluded"'));
  assert.ok(html.includes("Next"), "all matching listings must be reachable");
}
const secondPage = renderToStaticMarkup(await Page({ searchParams: { state_id: "mp", city_id: "chh", locality_id: "road", page: "2" } }));
assert.ok(secondPage.includes('data-property="road-12"'));
assert.ok(secondPage.includes("state_id=mp&amp;city_id=chh&amp;locality_id=road&amp;page=1"));
const unknown = renderToStaticMarkup(await Page({ searchParams: { locality_id: "unknown" } }));
assert.ok(unknown.includes("0 verified properties found."));
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
