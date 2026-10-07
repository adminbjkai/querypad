"use client";

import { useMemo, useState } from "react";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useSnippetStore } from "@/stores/snippet-store";
import { openSnippet, openTablePage, previewTable } from "@/lib/workspace-actions";
import { Icon } from "@/components/ui/icons";
import { SectionLabel, Select, Tabs, btn, input } from "@/components/ui/primitives";
import { relativeTime } from "./format";

const TABS = ["Datasets", "Queries", "Snippets", "Spaces"] as const;
type Tab = (typeof TABS)[number];

const rowBtn =
  "flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent";

const SORTS = [
  { value: "name", label: "Name A–Z" },
  { value: "rows", label: "Most rows" },
  { value: "columns", label: "Most columns" },
] as const;
type Sort = (typeof SORTS)[number]["value"];

function Empty({ children }: { children: string }) {
  return <p className="px-5 py-8 text-center text-[13px] text-muted">{children}</p>;
}

function Datasets() {
  const tables = useWorkspaceStore((s) => s.tables);
  const views = useWorkspaceStore((s) => s.views);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<Sort>("name");
  const catalog = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...tables.map((t) => ({ ...t, kind: "Table" })), ...views.map((t) => ({ ...t, kind: "View" }))]
      .filter((t) => !q || t.name.toLowerCase().includes(q) || t.columns.some((c) => c.name.toLowerCase().includes(q)))
      .sort((a, b) => (sort === "rows" ? b.rowCount - a.rowCount : sort === "columns" ? b.columns.length - a.columns.length : 0) || a.name.localeCompare(b.name));
  }, [tables, views, search, sort]);

  return (
    <section aria-label="Data catalog">
      <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
        <label className="relative min-w-40 flex-1">
          <Icon name="search" size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input className={`${input} pl-9`} aria-label="Search data catalog" placeholder="Search datasets or columns…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <Select value={sort} onChange={setSort} options={[...SORTS]} ariaLabel="Sort data catalog" size="sm" />
        <span className="px-1 text-[12px] tabular-nums text-muted">{catalog.length} datasets</span>
      </div>
      <div className="max-h-[420px] overflow-auto">
        <table className="w-full table-fixed text-left text-[13px]">
          <colgroup>
            <col />
            <col className="w-24" />
            <col className="w-24 max-sm:hidden" />
            <col className="w-20" />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-surface">
            <tr className="h-8">
              <th scope="col" className="px-4 font-medium"><SectionLabel as="div">Dataset</SectionLabel></th>
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
                      <span className="block text-[11px] font-normal leading-4 text-muted">{t.kind}</span>
                    </span>
                  </button>
                </td>
                <td className="px-3 py-1 text-right tabular-nums text-muted">{t.rowCount.toLocaleString()}</td>
                <td className="hidden px-3 py-1 text-right tabular-nums text-muted sm:table-cell">{t.columns.length}</td>
                <td className="px-3 py-1">
                  <div className="flex justify-end gap-1">
                    <button className={btn.icon} aria-label={`Preview dataset ${t.name}`} title="Preview rows" onClick={() => previewTable(t.name)}><Icon name="play" size={14} /></button>
                    <button className={btn.icon} aria-label={`Inspect dataset ${t.name}`} title="Columns, details and profile" onClick={() => openTablePage(t.name)}><Icon name="profile" size={16} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {catalog.length === 0 && (
          <div className="p-8 text-center text-[13px] text-muted">
            <p>No datasets match “{search}”.</p>
            <button className={`${btn.ghost} mt-2`} onClick={() => setSearch("")}>Clear search</button>
          </div>
        )}
      </div>
    </section>
  );
}

function Queries() {
  const history = useWorkspaceStore((s) => s.history);
  if (history.length === 0) return <Empty>Queries you run will appear here.</Empty>;
  return (
    <ul className="divide-y divide-line">
      {history.slice(0, 8).map((h) => (
        <li key={h.id}>
          <button className={rowBtn} onClick={() => openSnippet(h.sql, "From history")} title="Open SQL in a new tab">
            <Icon name={h.error ? "alert" : "check"} size={14} className={h.error ? "text-danger" : "text-ok"} />
            <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink">{h.sql.replace(/\s+/g, " ")}</span>
            <span className="hidden shrink-0 text-[11px] tabular-nums text-muted sm:inline">
              {h.error ? "Failed" : `${h.rowCount?.toLocaleString() ?? 0} rows · ${h.ms.toLocaleString()} ms`}
            </span>
            <span className="w-16 shrink-0 text-right text-[11px] tabular-nums text-faint">{relativeTime(h.at)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function Snippets() {
  const snippets = useSnippetStore((s) => s.snippets);
  if (snippets.length === 0) return <Empty>Saved snippets will appear here.</Empty>;
  const sorted = [...snippets].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 8);
  return (
    <ul className="divide-y divide-line">
      {sorted.map((sn) => (
        <li key={sn.id}>
          <button className={rowBtn} onClick={() => openSnippet(sn.sql, sn.name)} title="Open SQL in a new tab">
            <Icon name="bookmark" size={14} className="text-faint" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] text-ink">{sn.name}</span>
              {sn.description && <span className="block truncate text-[11px] text-muted">{sn.description}</span>}
            </span>
            {sn.folder && <span className="shrink-0 truncate text-[11px] text-faint">{sn.folder}</span>}
            <span className="w-16 shrink-0 text-right text-[11px] tabular-nums text-faint">{relativeTime(sn.updatedAt)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function Spaces() {
  const spaces = useWorkspaceStore((s) => s.spaces);
  const spaceId = useWorkspaceStore((s) => s.spaceId);
  const switchSpace = useWorkspaceStore((s) => s.switchSpace);
  const others = [...spaces].filter((s) => s.id !== spaceId).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 8);
  if (others.length === 0) return <Empty>Your other spaces will appear here.</Empty>;
  return (
    <ul className="divide-y divide-line">
      {others.map((s) => (
        <li key={s.id}>
          <button className={rowBtn} onClick={() => void switchSpace(s.id)}>
            <Icon name="folder" size={14} className="text-faint" />
            <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{s.name}</span>
            <span className="shrink-0 text-[11px] tabular-nums text-faint">{s.tableCount} {s.tableCount === 1 ? "table" : "tables"}</span>
            <span className="w-16 shrink-0 text-right text-[11px] tabular-nums text-faint">{relativeTime(s.updatedAt)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export default function RecentTabs() {
  const [tab, setTab] = useState<Tab>("Datasets");

  return (
    <section aria-label="Recent" className="mt-8">
      <h2 className="mb-2 text-[14px] font-semibold leading-5 text-ink">Recent</h2>
      <div className="overflow-hidden rounded-xl border border-line bg-surface">
        <Tabs value={tab} onChange={(v) => setTab(v as Tab)} ariaLabel="Recent" className="px-3" tabs={TABS.map((t) => ({ value: t, label: t }))} />
        <div role="tabpanel" aria-label={tab}>
          {tab === "Datasets" ? <Datasets /> : tab === "Queries" ? <Queries /> : tab === "Snippets" ? <Snippets /> : <Spaces />}
        </div>
      </div>
    </section>
  );
}
