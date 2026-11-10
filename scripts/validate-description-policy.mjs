import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
import ts from "typescript";

const exports = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync("src/lib/property-description-policy.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports });
const blocked = [
  "Call 9899601701", "+91 (98996) 01701", "WhatsApp: 98996-01701",
  "संपर्क करें: ९८९९६०१७०१", "Call ９８９９６０１７０１", "98996\u200b01701",
  "owner@example.com", "owner @ example . com", "https://example.com/contact",
  "www.brickinfinity.com", "example.in", "wa.me/9899601701", "t.me/seller",
  "Instagram @property_owner", "tel:9899601701", "٠٩٨٩٩٦٠١٧٠١",
];
const allowed = [
  "2000 sq ft hall. Rent ₹20,000 per month.",
  "2 BHK, 2 bathrooms, 10 parking spaces. Built in 2020.",
  "Plot 123/45, Ward 12, Chhatarpur 471001.",
  "**विशाल हॉल**\n\n✅ मुख्य सड़क पर\n✅ जिम और पार्किंग",
  "Contact the seller using the enquiry panel.", "", null,
];
for (const value of blocked) assert.equal(exports.hasDescriptionContactDetails(value), true, String(value));
for (const value of allowed) assert.equal(exports.hasDescriptionContactDetails(value), false, String(value));
console.log(`Description policy checks passed (${blocked.length} blocked, ${allowed.length} allowed).`);

if (process.argv.includes("--database")) {
  const { PGlite } = await import("@electric-sql/pglite");
  const db = new PGlite();
  await db.exec("CREATE TABLE public.properties (id integer PRIMARY KEY, description text, status text); INSERT INTO public.properties VALUES (1, 'Legacy 9899601701', 'pending');");
  const migration = fs.readFileSync("supabase/migrations/20261110_block_description_contact_details.sql", "utf8");
  await db.exec(migration);
  await db.exec(migration);
  for (const value of [...blocked, ...allowed]) {
    const { rows } = await db.query("SELECT public.description_has_contact_details($1) AS blocked", [value]);
    assert.equal(rows[0].blocked, exports.hasDescriptionContactDetails(value), `JS/SQL consistency: ${value}`);
  }
  for (const value of blocked) {
    await assert.rejects(db.query("INSERT INTO public.properties VALUES (2,$1,'pending')", [value]), /Remove phone numbers/);
    await assert.rejects(db.query("UPDATE public.properties SET description=$1 WHERE id=1", [value + " changed"]), /Remove phone numbers/);
  }
  await db.exec("UPDATE public.properties SET status='active', description=description WHERE id=1");
  await db.query("UPDATE public.properties SET description=$1 WHERE id=1", [allowed[0]]);
  await db.close();
  console.log("Database trigger checks passed: direct writes blocked, legacy moderation unaffected, clean edits allowed, migration repeatable.");
}
