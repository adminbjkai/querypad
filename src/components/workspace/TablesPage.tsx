"use client";

import { useWorkspaceStore } from "@/stores/workspace-store";
import { useUiStore } from "@/stores/ui-store";
import DatasetList from "@/components/home/DatasetList";
import { Icon } from "@/components/ui/icons";
import { btn } from "@/components/ui/primitives";

/** The Data › Tables page: the space's catalog (Snowsight "Databases"-style), one row per dataset. */
export default function TablesPage() {
  const tableCount = useWorkspaceStore((s) => s.tables.length);
  const viewCount = useWorkspaceStore((s) => s.views.length);
  const setDialog = useUiStore((s) => s.setDialog);
  const count =
    tableCount + viewCount === 0
      ? "No datasets yet"
      : `${tableCount} ${tableCount === 1 ? "table" : "tables"}${viewCount ? `, ${viewCount} ${viewCount === 1 ? "view" : "views"}` : ""}`;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-surface">
      {/* The page header carries "Add data" while there is data; the empty state carries it otherwise. */}
      <div className="shrink-0 px-5 pb-4 pt-5 sm:px-8">
        <h1 className="flex items-center gap-2 text-[22px] font-semibold leading-7 tracking-[-0.01em] text-ink">
          <Icon name="table" size={20} className="text-accent" />
          Tables
        </h1>
        <p className="mt-1 text-[13px] text-muted">{count} in this space. Open one for its columns, rows and profile.</p>
      </div>
      {tableCount + viewCount === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center px-6 pb-16 text-center">
          <span className="flex size-9 items-center justify-center rounded-lg bg-raised text-muted">
            <Icon name="table" size={18} />
          </span>
          <p className="mt-3 text-[14px] font-medium text-ink">No tables in this space</p>
          <p className="mt-1 text-[13px] text-muted">Drop CSV, Parquet or JSON files anywhere, or paste a URL.</p>
          <button className={`${btn.primary} mt-4`} onClick={() => setDialog("addFiles")}>
            <Icon name="upload" size={16} />
            Add data
          </button>
        </div>
      ) : (
        <div className="mx-5 mb-5 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-line bg-surface sm:mx-8">
          <DatasetList fill />
        </div>
      )}
    </div>
  );
}
