export const PROPERTY_TITLE_LIMIT = 100;
export const PROPERTY_DESCRIPTION_WORD_LIMIT = 3000;

export function countTitleCharacters(value: string | null | undefined = "") {
  return Array.from(value || "").length;
}

export function countDescriptionWords(value: string | null | undefined = "") {
  return (value || "").match(/\S+/gu)?.length || 0;
}

export function validatePropertyTextLimits(title: string = "", description: string = "") {
  if (countTitleCharacters(title) > PROPERTY_TITLE_LIMIT) return "Property title must be 100 characters or fewer.";
  if (countDescriptionWords(description) > PROPERTY_DESCRIPTION_WORD_LIMIT) return "Property description must be 3,000 words or fewer.";
  return null;
}
