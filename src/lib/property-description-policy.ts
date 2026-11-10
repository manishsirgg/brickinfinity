export const DESCRIPTION_CONTACT_MESSAGE = "Remove phone numbers, email addresses, websites and social/contact links from the description. Buyers can contact you through the listing's Contact Seller panel.";

// Keep these patterns aligned with the database description guard migration.
const contactPatterns = [
  /(?:^|[^0-9])\+?[0-9](?:[\s().-]*[0-9]){9,14}(?:[^0-9]|$)/,
  /[a-z0-9._%+-]+\s*@\s*[a-z0-9.-]+\s*\.\s*[a-z]{2,}/i,
  /https?:\/\/|www\.|(?:wa\.me|t\.me)\/|(?:mailto|tel):/i,
  /[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|in|org|net|co|io|me|biz|info|app|dev|online|site)(?:\b|\/)/i,
  /(?:^|\s)@[a-z0-9_][a-z0-9_.]{1,}/i,
];

export function hasDescriptionContactDetails(value: string | null | undefined) {
  const normalized = (value || "").normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[०-९٠-٩]/g, digit => String(digit.charCodeAt(0) - (digit >= "०" ? 0x0966 : 0x0660)));
  return contactPatterns.some(pattern => pattern.test(normalized));
}
