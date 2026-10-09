"use client";

import { useMemo, useState } from "react";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useUiStore } from "@/stores/ui-store";
import { openTablePage, previewTable } from "@/lib/workspace-actions";
import { Icon } from "@/components/ui/icons";
import { SectionLabel, Select, btn, input } from "@/components/ui/primitives";

const SORTS = [
  { value: "name", label: "Name A–Z" },
  { value: "rows", label: "Most rows" },
  { value: "columns", label: "Most columns" },
] as const;
type Sort = (typeof SORTS)[number]["value"];

/**
 * The searchable, sortable catalog of tables and views with Preview / Open / Profile actions.
 * Home shows it in a bounded card; the Tables page lets it fill the page (`fill`).
 */
export default function DatasetList({ fill = false }: { fill?: boolean }) {
  const tables = useWorkspaceStore((s) => s.tables);
  const views = useWorkspaceStore((s) => s.views);
  const schemaContext = useUiStore((s) => s.schemaContext);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<Sort>("name");
  const noun = fill ? "table" : "dataset";
  const nouns = fill ? "tables" : "datasets";
  const catalog = useMemo(() => {
    const q = search.trim().toLowerCase();
    const inSchema = (t: { schema?: string; database?: string }) =>
      (t.database ?? "memory") === schemaContext.db && (t.schema ?? "main") === schemaContext.schema;
    return [...tables.map((t) => ({ ...t, kind: "Table" })), ...views.map((t) => ({ ...t, kind: "View" }))]
      .filter(inSchema)
      .filter((t) => !q || t.name.toLowerCase().includes(q) || t.columns.some((c) => c.name.toLowerCase().includes(q)))
      .sort((a, b) => (sort === "rows" ? b.rowCount - a.rowCount : sort === "columns" ? b.columns.length - a.columns.length : 0) || a.name.localeCompare(b.name));
  }, [tables, views, search, sort, schemaContext]);

  return (
    <section aria-label="Data catalog" className={fill ? "flex min-h-0 flex-1 flex-col" : undefined}>
      <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
        <label className="relative min-w-40 flex-1">
          <Icon name="search" size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input className={`${input} pl-9`} aria-label="Search data catalog" placeholder={`Search ${nouns} or columns…`} value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <Select value={sort} onChange={setSort} options={[...SORTS]} ariaLabel="Sort data catalog" size="sm" />
        <span className="px-1 text-[12px] tabular-nums text-muted">{catalog.length} {catalog.length === 1 ? noun : nouns}</span>
      </div>
      <div className={fill ? "min-h-0 flex-1 overflow-auto" : "max-h-[420px] overflow-auto"}>
        <table className="w-full table-fixed text-left text-[13px]">
          <colgroup>
            <col />
            <col className="w-24" />
            <col className="w-24 max-sm:hidden" />
            <col className="w-28" />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-surface">
            <tr className="h-8">
              <th scope="col" className="px-4 font-medium"><SectionLabel as="div">{fill ? "Name" : "Dataset"}</SectionLabel></th>
              <th scope="col" className="px-3 font-medium"><SectionLabel as="div" className="justify-end">Rows</SectionLabel></th>
              <th scope="col" className="hidden px-3 font-medium sm:table-cell"><SectionLabel as="div" className="justify-end">Columns</SectionLabel></th>
              <th scope="col" className="px-3 font-medium"><span className="sr-only">Explore</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line border-t border-line">
            {catalog.map((t) => (
              <tr key={`${t.kind}:${t.name}`} className="h-12 hover:bg-sunken">
                <td className="px-4 py-1">
                  <button onClick={() => openTablePage(t.name)} title="Open the table page" className="flex max-w-full items-center gap-2.5 rounded text-left font-medium hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent"><Icon name={t.kind === "View" ? "file" : "table"} size={14} /></span>
                    <span className="min-w-0">
                      <span className="block truncate leading-5" title={t.name}>{t.name}</span>
                      <span className="block text-[11px] font-normal leading-4 text-muted">
                        {t.kind}
                        {t.database && t.database !== "memory" ? ` · ${t.database}.${t.schema ?? "main"}` : t.schema && t.schema !== "main" ? ` · ${t.schema}` : ""}
                      </span>
                    </span>
                  </button>
                </td>
                <td className="px-3 py-1 text-right tabular-nums text-muted">{t.rowCount.toLocaleString()}</td>
                <td className="hidden px-3 py-1 text-right tabular-nums text-muted sm:table-cell">{t.columns.length}</td>
                <td className="px-3 py-1">
                  <div className="flex justify-end gap-1">
                    <button className={btn.icon} aria-label={`Preview dataset ${t.name}`} title="Preview rows in SQL" onClick={() => previewTable(t.name)}><Icon name="play" size={14} /></button>
                    <button className={btn.icon} aria-label={`Inspect dataset ${t.name}`} title="Open: columns and details" onClick={() => openTablePage(t.name)}><Icon name="columns" size={16} /></button>
                    {t.kind === "Table" && (
                      <button className={btn.icon} aria-label={`Profile dataset ${t.name}`} title="Profile: stats for every column" onClick={() => openTablePage(t.name, "profile")}><Icon name="profile" size={16} /></button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {catalog.length === 0 && (
          <div className="p-8 text-center text-[13px] text-muted">
            {search.trim() ? (
              <>
                <p>No {nouns} match “{search}”.</p>
                <button className={`${btn.ghost} mt-2`} onClick={() => setSearch("")}>Clear search</button>
              </>
            ) : (
              <p>Nothing in {schemaContext.db}.{schemaContext.schema}.</p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
