import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const sourcePath = "src/lib/property-search.ts";
const source = fs.readFileSync(sourcePath, "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
    esModuleInterop: true,
  },
  fileName: sourcePath,
});

const sandbox = { exports: {}, module: { exports: {} } };
sandbox.exports = sandbox.module.exports;
vm.runInNewContext(outputText, sandbox, { filename: sourcePath });

const { buildPropertyKeywordOr, getPropertyTypeIntent, getSearchAliases } =
  sandbox.module.exports;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(
  getPropertyTypeIntent("plot") === "plot",
  'Expected getPropertyTypeIntent("plot") to return "plot".',
);

const aliases = getSearchAliases("plot");
assert(
  aliases.includes("plot"),
  'Expected getSearchAliases("plot") to include "plot".',
);
assert(
  aliases.includes("land"),
  'Expected getSearchAliases("plot") to include "land".',
);

const keywordOr = buildPropertyKeywordOr(aliases, {
  cityIds: [],
  localityIds: [],
});
assert(
  keywordOr.includes("property_type.ilike.%plot%"),
  "Expected property keyword OR to search property_type with ilike for plot.",
);
assert(
  keywordOr.includes("property_type.ilike.%land%"),
  "Expected property keyword OR to search property_type with ilike for land.",
);
assert(
  !keywordOr.includes("property_type.eq."),
  "Expected property keyword OR not to use exact property_type equality.",
);
assert(
  !keywordOr.includes("address.ilike") && !keywordOr.includes("location.ilike"),
  "Expected property keyword OR not to reference non-schema address/location columns.",
);

console.log("Property search alias and query guard passed.");
