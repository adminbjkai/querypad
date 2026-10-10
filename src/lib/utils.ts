export function fileExtension(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

export function sanitizeTableName(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, "");
  const sanitized = base.replace(/[^a-zA-Z0-9_]/g, "_").replace(/^(\d)/, "_$1");
  return sanitized || "table_data";
}

export function formatValue(val: unknown): string {
  if (val === null || val === undefined) return "NULL";
  if (typeof val === "number") {
    if (Number.isInteger(val)) return String(val);
    return parseFloat(val.toPrecision(15)).toString();
  }
  if (typeof val === "object") return JSON.stringify(val);
  return String(val);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  // One decimal, dropped when it is zero ("100 MB", "1.5 KB").
  const one = (n: number) => n.toFixed(1).replace(/\.0$/, "");
  if (bytes < 1024 * 1024) return `${one(bytes / 1024)} KB`;
  return `${one(bytes / (1024 * 1024))} MB`;
}
