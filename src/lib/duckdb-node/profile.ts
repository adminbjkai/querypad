import type { TableInfo, TableProfile } from "../../types";
import { profileTableWith } from "../discovery/profile";
import type { QueryRunner } from "../discovery/relationships";

/** Profile a single loaded table using the Node DuckDB runner. */
export function profileTable(
  table: TableInfo,
  runner: QueryRunner,
  now: number
): Promise<TableProfile> {
  return profileTableWith(runner, table, now);
}
