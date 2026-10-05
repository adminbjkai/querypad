import { profileTableWith } from "@/lib/discovery/profile";
import type { TableInfo, TableProfile } from "@/types";
import { createBrowserQueryRunner } from "./browser-runner";

export async function profileTable(table: TableInfo): Promise<TableProfile> {
  return profileTableWith(createBrowserQueryRunner(), table);
}
