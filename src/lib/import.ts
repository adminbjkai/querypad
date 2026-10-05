import { useWorkspaceStore } from "@/stores/workspace-store";
import { toast } from "@/stores/ui-store";

/** Import files into the workspace and surface the outcome as toasts. */
export async function importAndReport(files: Iterable<File>): Promise<string[]> {
  const { added, problems } = await useWorkspaceStore.getState().importFiles(files);
  for (const problem of problems) toast(problem.message, problem.tone);
  if (added.length === 1) toast(`Added table ${added[0]}.`, "success");
  else if (added.length > 1) toast(`Added ${added.length} tables: ${added.join(", ")}.`, "success");
  return added;
}
