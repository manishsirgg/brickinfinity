export const propertyIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function parseCompareIds(raw: string | null) {
  try { const value: unknown = JSON.parse(raw || "[]"); return Array.isArray(value) ? [...new Set(value.filter((v): v is string => typeof v === "string" && propertyIdPattern.test(v)).map(v => v.toLowerCase()))].slice(0, 3) : []; } catch { return []; }
}
