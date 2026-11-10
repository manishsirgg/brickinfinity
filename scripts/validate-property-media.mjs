import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
function load(path) {
  const exports = {};
  const { outputText } = ts.transpileModule(fs.readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  });
  vm.runInNewContext(outputText, { exports, require });
  return exports;
}

const { getCoverImage } = load("src/lib/property-images.ts");
const images = [
  { image_url: "second.jpg", sort_order: 1 },
  { image_url: "cover.jpg", sort_order: 0 },
];
assert.equal(getCoverImage(images), "cover.jpg");
assert.equal(images[0].image_url, "second.jpg", "cover lookup must not mutate query data");
assert.equal(getCoverImage([]), "/placeholder.jpg");
assert.equal(getCoverImage(null), "/placeholder.jpg");
assert.equal(getCoverImage([{ image_url: "legacy.jpg" }]), "legacy.jpg");

const Description = load("src/components/property/PropertyDescription.tsx").default;
const markup = renderToStaticMarkup(React.createElement(Description, {
  text: "First paragraph\n\n✅ **Important detail**\n    Indented detail\n<script>alert(1)</script>",
}));
assert.ok(markup.includes("First paragraph\n\n"));
assert.ok(markup.includes("<strong>Important detail</strong>"));
assert.ok(markup.includes("    Indented detail"));
assert.ok(markup.includes("whitespace-pre-wrap"));
assert.ok(!markup.includes("<script>"), "description HTML must remain escaped");
assert.ok(markup.includes("&lt;script&gt;"));
console.log("Property cover and description regression checks passed.");
