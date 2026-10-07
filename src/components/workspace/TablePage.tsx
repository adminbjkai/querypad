"use client";

import { useEffect, useMemo, useState } from "react";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useUiStore, type TablePageTab } from "@/stores/ui-store";
import type { QueryResult, TableProfileState } from "@/types";
import { relationshipKey } from "@/lib/discovery/relationships";
import { formatBytes } from "@/lib/utils";
import { copyTableName, previewRows, previewTable } from "@/lib/workspace-actions";
import { askAssistant } from "@/components/home/Composer";
import { ColumnCard } from "@/components/sidebar/ProfileDrawer";
import DataTable from "@/components/results/DataTable";
import { Icon } from "@/components/ui/icons";
import { Chip, KindGlyph, SectionLabel, Spinner, Tabs, btn, input } from "@/components/ui/primitives";

const TABS: { id: TablePageTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "preview", label: "Preview" },
  { id: "profile", label: "Profile" },
];

const IDLE: TableProfileState = { status: "idle", profile: null, error: null };

type SortKey = "index" | "name" | "type";

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <dt className="shrink-0 text-[12px] text-muted">{label}</dt>
      <dd className="min-w-0 truncate text-right text-[12px] tabular-nums text-ink">{children}</dd>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface px-4 py-3">
      <p className="text-[22px] font-semibold leading-7 tabular-nums tracking-[-0.01em] text-ink">{value}</p>
      <p className="mt-0.5 text-[12px] text-muted">{label}</p>
    </div>
  );
}

function SortHeader({ label, active, dir, onClick, className = "" }: { label: string; active: boolean; dir: "asc" | "desc"; onClick: () => void; className?: string }) {
  return (
    <th scope="col" aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"} className={`h-8 px-3 font-medium ${className}`}>
      <button onClick={onClick} className="inline-flex items-center gap-1 rounded text-[11px] uppercase tracking-wide text-faint hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
        {label}
        <Icon name={active ? (dir === "asc" ? "sortAsc" : "sortDesc") : "sort"} size={12} className={active ? "text-accent" : "opacity-60"} />
      </button>
    </th>
  );
}

/** Rows of the table, fetched once per table without creating a SQL tab. */
function PreviewTab({ name }: { name: string }) {
  const [state, setState] = useState<{ name: string; result: QueryResult | null; error: string | null }>({ name, result: null, error: null });
  const [filter, setFilter] = useState("");
  const [showStats, setShowStats] = useState(true);
  useEffect(() => {
    let cancelled = false;
    previewRows(name).then(
      (result) => !cancelled && setState({ name, result, error: null }),
      (err) => !cancelled && setState({ name, result: null, error: err instanceof Error ? err.message : String(err) })
    );
    return () => {
      cancelled = true;
    };
  }, [name]);

  // A stale result from the previous table counts as loading.
  const current = state.name === name ? state : null;
  if (current?.error) {
    return (
      <div role="alert" className="px-1 py-6 text-[13px]">
        <p className="font-medium text-danger">Could not load rows</p>
        <p className="mt-1 whitespace-pre-wrap text-muted">{current.error}</p>
      </div>
    );
  }
  if (!current?.result) {
    return (
      <div role="status" aria-label="Loading rows" className="space-y-2 py-2">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="qp-skeleton h-7 w-full" />
        ))}
      </div>
    );
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 py-2">
        <input className={`${input} max-w-xs`} aria-label="Filter rows" placeholder="Filter rows" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <span className="text-[12px] tabular-nums text-muted">
          First {current.result.rowCount.toLocaleString()} rows
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-line">
        <DataTable
          key={name}
          result={current.result}
          filter={filter}
          showStats={showStats}
          onToggleStats={() => setShowStats((v) => !v)}
          onInspect={() => useUiStore.getState().setTablePageTab("profile")}
        />
      </div>
    </div>
  );
}

/** One dataset's page: breadcrumb-level object view with Overview, Preview and Profile tabs. */
export default function TablePage() {
  const name = useUiStore((s) => s.tablePage) ?? "";
  const tab = useUiStore((s) => s.tablePageTab);
  const setTab = useUiStore((s) => s.setTablePageTab);
  const table = useWorkspaceStore((s) => s.tables.find((t) => t.name === name));
  const view = useWorkspaceStore((s) => s.views.find((v) => v.name === name));
  const fileEntry = useWorkspaceStore((s) => s.fileEntries.find((f) => f.name === name));
  const profileState = useWorkspaceStore((s) => s.tableProfiles[name]) ?? IDLE;
  const loadTableProfile = useWorkspaceStore((s) => s.loadTableProfile);
  const discovery = useWorkspaceStore((s) => s.discovery);
  const verdicts = useWorkspaceStore((s) => s.relationshipVerdicts);

  const info = table ?? view;
  const isView = !table && !!view;

  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "index", dir: "asc" });

  // Profiling runs on demand; the Profile tab starts it the first time it is opened.
  useEffect(() => {
    if (tab === "profile" && table && profileState.status === "idle") void loadTableProfile(name);
  }, [tab, table, profileState.status, loadTableProfile, name]);

  const relationships = useMemo(
    () => discovery.relationships.filter((r) => (r.from.table === name || r.to.table === name) && verdicts[relationshipKey(r)] !== "rejected"),
    [discovery.relationships, verdicts, name]
  );
  const marks = useMemo(() => {
    const m = new Map<string, "key" | "ref">();
    for (const rel of relationships) {
      if (rel.to.table === name) m.set(rel.to.column, "key");
      if (rel.from.table === name && !m.has(rel.from.column)) m.set(rel.from.column, "ref");
    }
    return m;
  }, [relationships, name]);
  const uniqueColumns = useMemo(() => {
    const set = new Set<string>();
    const profile = profileState.profile;
    if (!profile) return set;
    for (const c of profile.columns) {
      if (c.distinctCount !== null && profile.rowCount > 0 && c.nullCount === 0 && c.distinctCount === profile.rowCount) set.add(c.name);
    }
    return set;
  }, [profileState.profile]);

  const columns = useMemo(() => {
    if (!info) return [];
    const q = filter.trim().toLowerCase();
    const rows = info.columns.map((c, i) => ({ ...c, index: i + 1 })).filter((c) => !q || c.name.toLowerCase().includes(q));
    const factor = sort.dir === "asc" ? 1 : -1;
    return rows.sort((a, b) => {
      if (sort.key === "index") return (a.index - b.index) * factor;
      const av = sort.key === "name" ? a.name : a.type;
      const bv = sort.key === "name" ? b.name : b.type;
      return av.localeCompare(bv) * factor || a.index - b.index;
    });
  }, [info, filter, sort]);

  if (!info) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-surface p-8 text-center">
        <span className="flex size-9 items-center justify-center rounded-lg bg-raised text-muted">
          <Icon name="table" size={18} />
        </span>
        <p className="text-[14px] font-medium text-ink">{name ? `${name} is no longer in this space` : "No table selected"}</p>
        <p className="text-[13px] text-muted">Pick a dataset from Home or the Tables panel.</p>
        <button className={btn.primary} onClick={() => useUiStore.getState().setWorkspacePage("home")}>Go to Home</button>
      </div>
    );
  }

  const toggleSort = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));

  const profiled = profileState.status === "ready" && !!profileState.profile;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-y-auto bg-surface">
      <div className="mx-auto flex w-full max-w-[1280px] flex-1 flex-col px-5 pb-8 pt-5 sm:px-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
                <Icon name={isView ? "file" : "table"} size={16} />
              </span>
              <h1 className="min-w-0 truncate font-mono text-[22px] font-semibold leading-7 tracking-[-0.01em] text-ink" title={name}>{name}</h1>
            </div>
            <p className="mt-1.5 text-[13px] text-muted">
              {isView ? "View" : "Table"}
              {fileEntry && <> · from <span className="font-mono text-[12px] text-ink">{fileEntry.fileName}</span></>}
              {!isView && <> · {info.rowCount.toLocaleString()} rows · {info.columns.length} columns</>}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button className={btn.primary} onClick={() => previewTable(name)} title="Open SELECT * in a new SQL tab">
              <Icon name="code" size={16} />
              Query
            </button>
            <button className={btn.secondary} onClick={() => askAssistant(`Tell me about the ${isView ? "view" : "table"} ${name}: what it contains, data quality concerns, and how it connects to the other tables.`)}>
              <Icon name="sparkle" size={16} />
              <span className="max-sm:hidden">Ask Assistant about this table</span>
              <span className="sm:hidden">Ask</span>
            </button>
            <button className={btn.secondary} onClick={() => void copyTableName(name)} aria-label="Copy name" title="Copy name">
              <Icon name="copy" size={16} />
              <span className="max-sm:hidden">Copy name</span>
            </button>
          </div>
        </div>

        <Tabs
          value={tab}
          onChange={(next) => setTab(next as TablePageTab)}
          ariaLabel={`${name} sections`}
          tabs={TABS.map((t) => ({ value: t.id, label: t.label }))}
          className="mt-5"
        />

        <div role="tabpanel" aria-label={TABS.find((t) => t.id === tab)?.label} className="flex min-h-0 flex-1 flex-col">
          {tab === "overview" && (
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-3 py-3">
                  <input className={`${input} max-w-xs`} aria-label="Filter by name" placeholder="Filter by name" value={filter} onChange={(e) => setFilter(e.target.value)} />
                  <span className="text-[12px] tabular-nums text-muted">{columns.length} {columns.length === 1 ? "column" : "columns"}</span>
                </div>
                <div className="overflow-hidden rounded-lg border border-line">
                  <table className="w-full table-fixed text-left text-[13px]">
                    <thead className="bg-raised">
                      <tr>
                        <SortHeader label="#" active={sort.key === "index"} dir={sort.dir} onClick={() => toggleSort("index")} className="w-14" />
                        <SortHeader label="Column name" active={sort.key === "name"} dir={sort.dir} onClick={() => toggleSort("name")} />
                        <SortHeader label="Type" active={sort.key === "type"} dir={sort.dir} onClick={() => toggleSort("type")} className="w-40" />
                        <th scope="col" className="h-8 w-52 px-3 text-[11px] font-medium uppercase tracking-wide text-faint max-sm:hidden">Keys</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line border-t border-line">
                      {columns.map((c) => {
                        const mark = marks.get(c.name);
                        return (
                          <tr key={c.name} className="h-9 hover:bg-sunken">
                            <td className="px-3 tabular-nums text-faint">{c.index}</td>
                            <td className="px-3">
                              <span className="flex items-center gap-1">
                                <KindGlyph type={c.type} />
                                <span className="truncate font-mono text-[12px] font-medium text-ink">{c.name}</span>
                              </span>
                            </td>
                            <td className="truncate px-3 font-mono text-[12px] text-muted" title={c.type}>{c.type.toLowerCase()}</td>
                            <td className="px-3 max-sm:hidden">
                              <span className="flex items-center gap-1.5">
                                {mark && (
                                  <Chip tone={mark === "key" ? "join" : "accent"} className="gap-1">
                                    <Icon name={mark === "key" ? "key" : "join"} size={11} />
                                    {mark === "key" ? "join key" : "references"}
                                  </Chip>
                                )}
                                {uniqueColumns.has(c.name) && <Chip tone="neutral">unique</Chip>}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {columns.length === 0 && <p className="px-3 py-6 text-center text-[13px] text-muted">No columns match “{filter.trim()}”.</p>}
                </div>
              </div>

              <aside aria-label={`${name} details`} className="w-full shrink-0 rounded-lg border border-line bg-surface px-4 py-3 lg:mt-3 lg:w-[280px]">
                <SectionLabel as="h2">Table details</SectionLabel>
                <dl className="mt-1 divide-y divide-line-soft">
                  <Detail label="Object type">{isView ? "View" : "Table"}</Detail>
                  <Detail label="Columns">{info.columns.length}</Detail>
                  <Detail label="Rows">{isView ? "—" : info.rowCount.toLocaleString()}</Detail>
                  <Detail label="Source file">{fileEntry ? <span className="font-mono text-[11px]" title={fileEntry.fileName}>{fileEntry.fileName}</span> : "—"}</Detail>
                  <Detail label="Size">{fileEntry ? formatBytes(fileEntry.data.byteLength) : "—"}</Detail>
                  <Detail label="Profiled">
                    {profiled ? (
                      <button className="text-accent hover:underline" onClick={() => setTab("profile")}>Yes</button>
                    ) : isView ? "—" : (
                      <button className="text-accent hover:underline" onClick={() => setTab("profile")}>Not yet</button>
                    )}
                  </Detail>
                </dl>
                <SectionLabel as="h3" count={relationships.length} className="mt-4">Relationships</SectionLabel>
                {relationships.length === 0 ? (
                  <p className="mt-1.5 text-[12px] text-muted">
                    {discovery.status === "loading" ? "Discovering…" : "None detected."}
                  </p>
                ) : (
                  <ul className="mt-1.5 -mx-2">
                    {relationships.map((r) => {
                      const key = relationshipKey(r);
                      const other = r.from.table === name ? r.to : r.from;
                      const own = r.from.table === name ? r.from : r.to;
                      return (
                        <li key={key}>
                          <button
                            onClick={() => {
                              useUiStore.getState().setWorkspacePage("workbench");
                              useUiStore.getState().showPanel("joins");
                            }}
                            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
                            title="Review in the Joins panel"
                          >
                            <Icon name="join" size={14} className="shrink-0 text-join" />
                            <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-ink">
                              {own.column} → {other.table}.{other.column}
                            </span>
                            <span className={`shrink-0 text-[11px] tabular-nums ${verdicts[key] === "accepted" ? "text-ok" : "text-muted"}`}>
                              {verdicts[key] === "accepted" ? "accepted" : `${Math.round(r.confidence)}%`}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </aside>
            </div>
          )}

          {tab === "preview" && <PreviewTab name={name} />}

          {tab === "profile" && (
            <div className="pt-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <StatTile label="Row count" value={isView ? "—" : info.rowCount.toLocaleString()} />
                <StatTile label="Columns" value={String(info.columns.length)} />
              </div>
              <div className="mt-5 flex items-center justify-between gap-3">
                <h2 className="text-[13px] font-semibold text-ink">{name} profile</h2>
                {!isView && (
                  <button
                    className={btn.secondary}
                    onClick={() => void loadTableProfile(name)}
                    disabled={profileState.status === "loading"}
                  >
                    {profileState.status === "loading" ? <Spinner /> : <Icon name="refresh" size={14} />}
                    {profiled ? "Refresh" : "Profile now"}
                  </button>
                )}
              </div>
              {isView && <p className="mt-2 text-[13px] text-muted">Profiles are built for tables; query the view to inspect its columns.</p>}
              {profileState.status === "loading" && (
                <div role="status" aria-label="Profiling columns" className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="space-y-2 rounded-lg border border-line p-3">
                      <div className="qp-skeleton h-3.5 w-1/2" />
                      <div className="qp-skeleton h-2.5 w-full" />
                      <div className="qp-skeleton h-2.5 w-3/4" />
                    </div>
                  ))}
                </div>
              )}
              {profileState.status === "error" && (
                <div role="alert" className="mt-3 text-[13px]">
                  <p className="font-medium text-danger">Profiling failed</p>
                  <p className="mt-1 whitespace-pre-wrap text-muted">{profileState.error}</p>
                </div>
              )}
              {profiled && profileState.profile && (
                <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 [&>li]:rounded-lg [&>li]:border [&>li]:border-line">
                  {profileState.profile.columns.map((column) => (
                    <ColumnCard key={column.name} column={column} rowCount={profileState.profile!.rowCount} />
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
