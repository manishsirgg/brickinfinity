import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
import ts from "typescript";

const exports = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync("src/lib/property-text-limits.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports });
const { countTitleCharacters, countDescriptionWords, validatePropertyTextLimits } = exports;
assert.equal(countTitleCharacters("🏠".repeat(100)), 100);
assert.equal(validatePropertyTextLimits("🏠".repeat(100), "word ".repeat(500)), null);
assert.match(validatePropertyTextLimits("a".repeat(101), "valid"), /100 characters/);
assert.match(validatePropertyTextLimits("valid", "word ".repeat(501)), /500 words/);
assert.equal(countDescriptionWords(" \n\t"), 0);
assert.equal(countDescriptionWords("मुख्य सड़क\nपर हॉल"), 4);
assert.equal(countDescriptionWords("one\u00a0two\u2003three\uFEFFfour"), 4);
assert.equal(countDescriptionWords(null), 0);
console.log("Property text limit checks passed, including boundaries, Unicode and whitespace.");

if (process.argv.includes("--database")) {
  const { PGlite } = await import("@electric-sql/pglite");
  const db = new PGlite();
  await db.exec("CREATE TABLE public.properties (id integer PRIMARY KEY, title text, description text, status text)");
  await db.query("INSERT INTO public.properties VALUES (1,$1,$2,'pending')", ["x".repeat(101), "word ".repeat(501)]);
  const migration = fs.readFileSync("supabase/migrations/20261111_property_text_limits.sql", "utf8");
  await db.exec(migration);
  const descriptionMigration = fs.readFileSync("supabase/migrations/20261111_property_text_limits_500_words.sql", "utf8");
  await db.exec(descriptionMigration);
  await db.exec(descriptionMigration);
  for (const value of [null, "", " \n\t", "मुख्य सड़क\nपर हॉल", "one\u00a0two\u2003three\uFEFFfour", "word ".repeat(500)]) {
    const { rows } = await db.query("SELECT public.property_description_word_count($1) AS count", [value]);
    assert.equal(rows[0].count, countDescriptionWords(value));
  }
  await db.query("INSERT INTO public.properties VALUES (2,$1,$2,'pending')", ["🏠".repeat(100), "word ".repeat(500)]);
  await assert.rejects(db.query("INSERT INTO public.properties VALUES (3,$1,'clean','pending')", ["x".repeat(101)]), /100 characters/);
  await assert.rejects(db.query("INSERT INTO public.properties VALUES (4,'Clean title',$1,'pending')", ["word ".repeat(501)]), /500 words/);
  await assert.rejects(db.query("UPDATE public.properties SET description=$1 WHERE id=2", ["word ".repeat(501)]), /500 words/);
  await assert.rejects(db.query("UPDATE public.properties SET title=$1 WHERE id=2", ["🏠".repeat(101)]), /100 characters/);
  await db.exec("UPDATE public.properties SET status='active', title=title, description=description WHERE id=1");
  await db.exec("UPDATE public.properties SET title='Clean title', description='Clean description' WHERE id=1");
  await db.close();
  console.log("Database limits passed: matching counts, insert/update boundaries, unchanged legacy moderation and repeatability.");
}
