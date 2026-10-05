import { formatBytes } from "./utils";

/** Sample files served from /public/sample and preloaded for first-time visitors. */
export const SAMPLE_FILES = ["employees.csv", "departments.csv"] as const;
export const SAMPLE_TABLE_NAMES = new Set(["employees", "departments"]);
export const SAMPLE_QUERY = `SELECT d.dept_name, COUNT(*) AS headcount, ROUND(AVG(e.salary)) AS avg_salary
FROM employees e
JOIN departments d ON e.dept_id = d.dept_id
GROUP BY d.dept_name
ORDER BY headcount DESC`;

/** File types the browser app can load (extension without the dot). */
export const SUPPORTED_EXTENSIONS = ["parquet", "csv", "tsv", "json", "jsonl", "ndjson", "xlsx"];
export const ACCEPTED_EXTENSIONS = SUPPORTED_EXTENSIONS.map((ext) => `.${ext}`);

/** Hard limit: files above this size are rejected */
export const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB

/** Soft warning: files above this size show a performance warning */
export const WARN_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

/**
 * Validate file size. Returns null if OK, or an error/warning message.
 * `type` is "error" (reject) or "warning" (allow with caution).
 */
export function checkFileSize(file: File): { type: "error" | "warning"; message: string } | null {
  if (file.size > MAX_FILE_SIZE) {
    return {
      type: "error",
      message: `${file.name} is ${formatBytes(file.size)} — over the ${formatBytes(MAX_FILE_SIZE)} limit. Filter or split it before importing.`,
    };
  }
  if (file.size > WARN_FILE_SIZE) {
    return {
      type: "warning",
      message: `${file.name} is ${formatBytes(file.size)}. Large files run entirely in your browser, so queries may be slower.`,
    };
  }
  return null;
}
