const INDIA_TIMEZONE = "Asia/Kolkata";

const ADMIN_FINANCE_DATE_FORMATTER = new Intl.DateTimeFormat("en-IN", {
  timeZone: INDIA_TIMEZONE,
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZoneName: "short",
});

function normalizeTimestampInput(value: string): string {
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value);
  return hasTimezone ? value : `${value}Z`;
}

export function formatAdminFinanceDateTime(
  value: string | null | undefined,
  fallback = "-"
): string {
  if (!value) return fallback;

  const normalized = normalizeTimestampInput(value.trim());
  const date = new Date(normalized);

  if (Number.isNaN(date.getTime())) return fallback;

  return ADMIN_FINANCE_DATE_FORMATTER.format(date);
}
