import { normalizeValue } from "@/lib/discovery/profile";
import type { QueryRunner } from "@/lib/discovery/relationships";
import { getConnection } from "./instance";

/**
 * A browser `QueryRunner` backed by DuckDB-Wasm — lets the engine-agnostic discovery
 * and profiling core run in the browser, mirroring the Node CLI's runner. Arrow values
 * (bigint, wrapper objects, Date) are normalized into plain JS values.
 */
export function createBrowserQueryRunner(): QueryRunner {
  return async (sql: string) => {
    const conn = await getConnection();
    const result = await conn.query(sql);
    const names = result.schema.fields.map((field) => field.name);
    return result.toArray().map((row: Record<string, unknown>) => {
      const plain: Record<string, unknown> = {};
      for (const name of names) plain[name] = normalizeValue(row[name]);
      return plain;
    });
  };
}
