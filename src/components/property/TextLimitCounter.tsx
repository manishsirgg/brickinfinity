import { countDescriptionWords, countTitleCharacters, PROPERTY_DESCRIPTION_WORD_LIMIT, PROPERTY_TITLE_LIMIT } from "@/lib/property-text-limits";

export default function TextLimitCounter({ id, value, kind }: { id: string; value: string; kind: "title" | "description" }) {
  const count = kind === "title" ? countTitleCharacters(value) : countDescriptionWords(value);
  const limit = kind === "title" ? PROPERTY_TITLE_LIMIT : PROPERTY_DESCRIPTION_WORD_LIMIT;
  return <p id={id} aria-live="polite" className={`mt-2 text-sm ${count > limit ? "text-red-700" : "text-slate-500"}`}>
    {count.toLocaleString("en-IN")} / {limit.toLocaleString("en-IN")} {kind === "title" ? "characters" : "words"}
    {count > limit && " — limit exceeded; shorten this text before saving."}
  </p>;
}
