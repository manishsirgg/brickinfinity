import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
import ts from "typescript";

// Exercise the actual page handler without a live admin session or production writes.
const source = fs.readFileSync("src/app/admin/properties/page.tsx", "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
});
const property = { id: "property-1", seller_id: "seller-1" };

async function run({ result, authError = null, notificationError = null }) {
  const states = [];
  let index = 0;
  const calls = [];
  const supabase = {
    auth: { getUser: async () => ({ data: { user: authError ? null : { id: "admin-1" } }, error: authError }) },
    rpc: async (name, params) => { calls.push([name, params]); return result; },
    from: (table) => {
      calls.push(table);
      const query = new Proxy({}, {
        get: (_, key) => key === "then"
          ? (resolve) => resolve({ data: [], error: null })
          : key === "insert"
            ? async () => ({ error: notificationError })
            : () => query,
      });
      return query;
    },
  };
  const exports = {};
  const jsx = (type, props) => ({ type, props });
  vm.runInNewContext(outputText, {
    exports, console: { error() {} },
    require: (name) => {
      if (name === "react") return {
        useEffect() {},
        useState(initial) {
          const slot = index++;
          states[slot] = slot === 1 ? property : initial;
          return [states[slot], (value) => { states[slot] = value; }];
        },
      };
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (name === "next/link") return { default: "a" };
      if (name.endsWith("/supabase/client")) return { createClient: () => supabase };
      if (name.endsWith("/logAction")) return { logAction: async () => calls.push("audit") };
      throw new Error(`Unexpected import: ${name}`);
    },
  });
  function findPublish(node) {
    if (!node || typeof node !== "object") return null;
    if (node.type === "button" && node.props.children === "Publish Now") return node;
    for (const child of [node.props?.children].flat(Infinity)) {
      const match = findPublish(child);
      if (match) return match;
    }
    return null;
  }
  await findPublish(exports.default()).props.onClick();
  assert.equal(states[7], false, "processing resets on every outcome");
  return { states, calls };
}

for (const result of [
  { data: null, error: { message: "Permission denied", code: "42501" } },
  { data: null, error: { message: "Missing function", code: "PGRST202" } },
  { data: null, error: null },
  { data: "another-property", error: null },
]) {
  const { states, calls } = await run({ result });
  assert.equal(states[1], property, "failed publication preserves selected property");
  assert.ok(states[8], "failure is visible to the admin");
  assert.ok(!calls.includes("notifications"), "failed publication must not notify seller");
  assert.ok(!calls.includes("audit"), "failed publication must not log success");
}
const expired = await run({ authError: new Error("expired") });
assert.equal(expired.calls.length, 0, "expired session cannot publish");
assert.match(expired.states[8], /sign in again/);
for (const notificationError of [null, { message: "Notification denied" }]) {
  const { states, calls } = await run({ result: { data: property.id, error: null }, notificationError });
  assert.equal(states[1], null, "confirmed publication clears selected property");
  assert.equal(states[8], null);
  assert.match(states[9], /published successfully/);
  assert.equal(calls[0][0], "admin_publish_property");
  assert.equal(calls[0][1].p_property_id, property.id);
  assert.ok(calls.includes("properties"), "confirmed publication refreshes queue");
}
console.log("Admin publish regression checks passed (7 scenarios).");
