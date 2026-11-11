import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const nativeRequire = createRequire(import.meta.url);
const modules = {};
function load(path) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports, require: name => modules[name] || nativeRequire(name) });
  return exports;
}
const viewsModule = load("src/components/property/PropertyViews.tsx");
modules["@/components/property/PropertyViews"] = viewsModule;
modules["@/lib/owner-verification"] = load("src/lib/owner-verification.ts");
modules["./VerificationBadges"] = load("src/components/property/VerificationBadges.tsx");
modules["./PropertyAvailability"] = { default: () => null };
modules["@/lib/property-images"] = load("src/lib/property-images.ts");
modules["@/lib/property-featured"] = { isPropertyFeaturedActive: () => false };
modules["next/link"] = { default: props => React.createElement("a", props) };
for (const [count, label] of [[0, "0 views"], [1, "1 view"], [12345, "12,345 views"], [null, "0 views"], [-1, "0 views"], [Infinity, "0 views"]]) {
  const html = renderToStaticMarkup(React.createElement(viewsModule.default, { count }));
  assert.ok(html.includes(label));
  assert.ok(html.includes('aria-hidden="true"'), "eye icon must not duplicate the readable label");
}
const Card = load("src/components/property/PropertyCard.tsx").default;
for (const count of [0, 1, 51]) {
  const html = renderToStaticMarkup(React.createElement(Card, { property: { id: "p", views_count: count, price: 20000, property_type: "Commercial" } }));
  assert.ok(!html.includes(">0<"), "false Popular condition must not render a bare zero");
  assert.ok(html.includes(`${count} ${count === 1 ? "view" : "views"}`));
  assert.equal(html.includes("🔥 Popular"), count > 50);
}
const footer = fs.readFileSync("src/components/Footer.tsx", "utf8");
assert.ok(footer.includes('href="https://www.instagram.com/brick_infinity/"'));
assert.ok(!footer.includes("instagarm.com"));
console.log("View count checks passed: zero/singular/plural/large counts, card Popular condition and Instagram URL.");
