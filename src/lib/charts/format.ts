const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const full = new Intl.NumberFormat("en", { maximumFractionDigits: 2 });

/** 1.2K / 3.4M style, for axes and labels. */
export function compactNumber(n: unknown): string {
  return typeof n === "number" && Number.isFinite(n) ? compact.format(n) : String(n ?? "");
}

/** Full precision (2 decimals max) with thousands separators, for tooltips. */
export function fullNumber(n: unknown): string {
  return typeof n === "number" && Number.isFinite(n) ? full.format(n) : String(n ?? "");
}
