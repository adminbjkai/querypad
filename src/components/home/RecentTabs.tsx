"use client";

import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useSnippetStore } from "@/stores/snippet-store";
import { useUiStore } from "@/stores/ui-store";
import { openSnippet, previewTable } from "@/lib/workspace-actions";
import { Icon } from "@/components/ui/icons";
import { btn, input } from "@/components/ui/primitives";
import { relativeTime } from "./format";

const TABS = ["Datasets", "Queries", "Snippets", "Spaces"] as const;
type Tab = (typeof TABS)[number];

const rowBtn =
  "flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent";

function Empty({ children }: { children: string }) {
  return <p className="px-5 py-8 text-center text-[13px] text-muted">{children}</p>;
}

function Datasets() {
  const tables = useWorkspaceStore((s) => s.tables);
  const views = useWorkspaceStore((s) => s.views);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("name");
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
        <select className={`${input} sm:!w-40`} aria-label="Sort data catalog" value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="name">Name A–Z</option>
          <option value="rows">Most rows</option>
          <option value="columns">Most columns</option>
        </select>
        <span className="px-1 text-xs tabular-nums text-muted">{catalog.length} datasets</span>
      </div>
      <div className="max-h-[420px] overflow-auto">
        <table className="w-full text-left text-[13px]">
          <thead className="sticky top-0 z-10 bg-surface text-[11px] uppercase tracking-wide text-faint">
            <tr>
              <th scope="col" className="px-4 py-2.5 font-medium">Dataset</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">Rows</th>
              <th scope="col" className="hidden px-3 py-2.5 text-right font-medium sm:table-cell">Columns</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium"><span className="sr-only">Explore</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line border-t border-line">
            {catalog.map((t) => (
              <tr key={`${t.kind}:${t.name}`} className="hover:bg-raised/70">
                <td className="max-w-52 px-4 py-2.5">
                  <button onClick={() => previewTable(t.name)} className="flex max-w-full items-center gap-2.5 rounded text-left font-medium hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent"><Icon name={t.kind === "View" ? "file" : "table"} size={15} /></span>
                    <span className="min-w-0">
                      <span className="block truncate" title={t.name}>{t.name}</span>
                      <span className="mt-0.5 block text-[11px] font-normal text-muted">{t.kind}</span>
                    </span>
                  </button>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-muted">{t.rowCount.toLocaleString()}</td>
                <td className="hidden px-3 py-2.5 text-right tabular-nums text-muted sm:table-cell">{t.columns.length}</td>
                <td className="px-3 py-2.5">
                  <div className="flex justify-end gap-1">
                    <button className={btn.icon} aria-label={`Preview dataset ${t.name}`} title="Preview rows" onClick={() => previewTable(t.name)}><Icon name="play" size={14} /></button>
                    {t.kind === "Table" && (
                      <button className={btn.icon} aria-label={`Inspect dataset ${t.name}`} title="Column statistics" onClick={() => { useUiStore.getState().setWorkspacePage("workbench"); useUiStore.getState().showPanel("tables"); useUiStore.getState().setProfileTable(t.name); }}><Icon name="profile" size={15} /></button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {catalog.length === 0 && (
          <div className="p-8 text-center text-sm text-muted">
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
            <span className="min-w-0 flex-1 truncate font-mono text-xs text-ink">{h.sql.replace(/\s+/g, " ")}</span>
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
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  function onKeyDown(e: KeyboardEvent) {
    const i = TABS.indexOf(tab);
    let next = i;
    if (e.key === "ArrowRight") next = (i + 1) % TABS.length;
    else if (e.key === "ArrowLeft") next = (i - 1 + TABS.length) % TABS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = TABS.length - 1;
    else return;
    e.preventDefault();
    setTab(TABS[next]);
    refs.current[TABS[next]]?.focus();
  }

  return (
    <section aria-label="Recent" className="mt-8">
      <h2 className="mb-2 text-[15px] font-semibold text-ink">Recent</h2>
      <div className="overflow-hidden rounded-xl border border-line bg-surface">
        <div role="tablist" aria-label="Recent" onKeyDown={onKeyDown} className="flex gap-1 border-b border-line px-3">
          {TABS.map((t) => (
            <button
              key={t}
              ref={(el) => { refs.current[t] = el; }}
              role="tab"
              id={`home-tab-${t}`}
              aria-selected={tab === t}
              aria-controls={`home-panel-${t}`}
              tabIndex={tab === t ? 0 : -1}
              onClick={() => setTab(t)}
              className={`-mb-px border-b-2 px-3 py-2.5 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent ${
                tab === t ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <div role="tabpanel" id={`home-panel-${tab}`} aria-labelledby={`home-tab-${tab}`}>
          {tab === "Datasets" ? <Datasets /> : tab === "Queries" ? <Queries /> : tab === "Snippets" ? <Snippets /> : <Spaces />}
        </div>
      </div>
    </section>
  );
}
