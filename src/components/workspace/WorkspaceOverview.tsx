"use client";

import { useMemo, useState } from "react";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useUiStore } from "@/stores/ui-store";
import { buildSemanticModel } from "@/lib/discovery/semantic-model";
import { relationshipKey } from "@/lib/discovery/relationships";
import { copyAgentContext, openSnippet, previewTable } from "@/lib/workspace-actions";
import { formatBytes } from "@/lib/utils";
import { Icon, type IconName } from "@/components/ui/icons";
import { btn, input, Spinner } from "@/components/ui/primitives";

function Metric({ label, value, detail, icon }: { label: string; value: string; detail: string; icon: IconName }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-5">
      <div className="flex items-center justify-between text-[12px] font-medium text-muted">
        {label}<Icon name={icon} size={17} className="text-accent" />
      </div>
      <p className="mt-3 text-3xl font-semibold tracking-tight tabular-nums text-ink">{value}</p>
      <p className="mt-1 text-xs text-muted">{detail}</p>
    </div>
  );
}

/** A read-only index over the live workspace; no second catalog or profiling engine. */
export default function WorkspaceOverview() {
  const name = useWorkspaceStore((s) => s.spaces.find((sp) => sp.id === s.spaceId)?.name ?? "Workspace");
  const tables = useWorkspaceStore((s) => s.tables);
  const views = useWorkspaceStore((s) => s.views);
  const files = useWorkspaceStore((s) => s.fileEntries);
  const profiles = useWorkspaceStore((s) => s.tableProfiles);
  const discovery = useWorkspaceStore((s) => s.discovery);
  const verdicts = useWorkspaceStore((s) => s.relationshipVerdicts);
  const history = useWorkspaceStore((s) => s.history);
  const unrestoredFiles = useWorkspaceStore((s) => s.unrestoredFiles);
  const unrestoredViews = useWorkspaceStore((s) => s.unrestoredViews);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("name");
  const ui = useUiStore.getState;

  const relationships = useMemo(() => discovery.relationships.filter((r) => verdicts[relationshipKey(r)] !== "rejected"), [discovery.relationships, verdicts]);
  const accepted = relationships.filter((r) => verdicts[relationshipKey(r)] === "accepted").length;
  const model = useMemo(() => buildSemanticModel(tables.map((t) => t.name), relationships, 0), [tables, relationships]);
  const rows = tables.reduce((sum, t) => sum + t.rowCount, 0);
  const bytes = files.reduce((sum, f) => sum + f.data.byteLength, 0);
  const profiled = tables.filter((t) => profiles[t.name]?.status === "ready").length;
  const catalog = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...tables.map((t) => ({ ...t, kind: "Table" })), ...views.map((t) => ({ ...t, kind: "View" }))]
      .filter((t) => !q || t.name.toLowerCase().includes(q) || t.columns.some((c) => c.name.toLowerCase().includes(q)))
      .sort((a, b) => (sort === "rows" ? b.rowCount - a.rowCount : sort === "columns" ? b.columns.length - a.columns.length : 0) || a.name.localeCompare(b.name));
  }, [tables, views, search, sort]);

  function reviewRelationships() { ui().showPanel("joins"); }
  function newQuery() {
    useWorkspaceStore.getState().setViewMode("sql");
    if (useWorkspaceStore.getState().addTab()) ui().setWorkspacePage("workbench");
  }

  return (
    <div className="mx-auto max-w-[1440px] space-y-6 p-4 pb-12 sm:p-7 lg:p-9">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-accent"><Icon name="folder" size={14} /> Workspace overview</p>
          <h1 className="break-words text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{name}</h1>
          <p className="mt-2 text-sm text-muted">Understand your data. Find the connections. Start your next analysis.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className={btn.secondary} onClick={newQuery}><Icon name="plus" size={15} />New query</button>
          <button className={btn.primary} onClick={() => ui().setDialog("addFiles")}><Icon name="upload" size={15} />Add data</button>
        </div>
      </div>

      {(unrestoredFiles.length > 0 || unrestoredViews.length > 0) && (
        <div role="alert" className="rounded-lg border border-warn/30 bg-warn-soft p-4 text-sm text-warn">
          <p className="font-semibold">Some saved data could not be restored</p>
          <p className="mt-1">{[...unrestoredFiles, ...unrestoredViews].map((f) => f.name).join(", ")}. Re-add missing source files to continue working with them.</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Metric label="Data catalog" value={String(tables.length + views.length)} detail={`${tables.length} tables · ${views.length} views`} icon="table" />
        <Metric label="Rows in tables" value={rows.toLocaleString()} detail={`${formatBytes(bytes)} of source files and snapshots`} icon="chart" />
        <Metric label="Relationships" value={String(relationships.length)} detail={`${accepted} accepted · ${relationships.length - accepted} to review`} icon="join" />
        <Metric label="Profiled tables" value={`${profiled} / ${tables.length}`} detail="Column statistics available" icon="profile" />
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          <section className="overflow-hidden rounded-xl border border-line bg-surface" aria-label="Data catalog">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
              <div><h2 className="text-sm font-semibold">Data catalog</h2><p className="mt-1 text-xs text-muted">Preview a dataset or inspect its column statistics.</p></div>
              <span className="rounded-full bg-raised px-2.5 py-1 text-xs tabular-nums text-muted">{catalog.length} datasets</span>
            </div>
            <div className="flex flex-wrap gap-2 border-b border-line bg-chrome/50 p-3">
              <label className="relative min-w-40 flex-1"><Icon name="search" size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" /><input className={`${input} pl-9`} aria-label="Search data catalog" placeholder="Search datasets or columns…" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
              <select className={`${input} sm:!w-40`} aria-label="Sort data catalog" value={sort} onChange={(e) => setSort(e.target.value)}><option value="name">Name A–Z</option><option value="rows">Most rows</option><option value="columns">Most columns</option></select>
            </div>
            <div className="max-h-[420px] overflow-auto">
              <table className="w-full text-left text-[13px]">
                <thead className="sticky top-0 z-10 bg-chrome text-[11px] uppercase tracking-wide text-muted"><tr><th scope="col" className="px-5 py-3 font-medium">Dataset</th><th scope="col" className="px-3 py-3 text-right font-medium">Rows</th><th scope="col" className="hidden px-3 py-3 text-right font-medium sm:table-cell">Columns</th><th scope="col" className="px-4 py-3 text-right font-medium">Explore</th></tr></thead>
                <tbody className="divide-y divide-line">
                  {catalog.map((t) => (
                    <tr key={`${t.kind}:${t.name}`} className="group hover:bg-raised/70">
                      <td className="max-w-52 px-5 py-3"><button onClick={() => previewTable(t.name)} className="flex max-w-full items-center gap-2.5 text-left font-medium hover:text-accent"><span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent"><Icon name={t.kind === "View" ? "file" : "table"} size={15} /></span><span className="min-w-0"><span className="block truncate" title={t.name}>{t.name}</span><span className="mt-0.5 block text-[11px] font-normal text-muted">{t.kind}</span></span></button></td>
                      <td className="px-3 py-3 text-right tabular-nums text-muted">{t.rowCount.toLocaleString()}</td>
                      <td className="hidden px-3 py-3 text-right tabular-nums text-muted sm:table-cell">{t.columns.length}</td>
                      <td className="px-4 py-3"><div className="flex justify-end gap-1"><button className={btn.icon} aria-label={`Preview dataset ${t.name}`} title="Preview rows" onClick={() => previewTable(t.name)}><Icon name="play" size={14} /></button>{t.kind === "Table" && <button className={btn.icon} aria-label={`Inspect dataset ${t.name}`} title="Column statistics" onClick={() => { ui().showPanel("tables"); ui().setProfileTable(t.name); }}><Icon name="profile" size={15} /></button>}</div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {catalog.length === 0 && <div className="p-8 text-center text-sm text-muted"><p>No datasets match “{search}”.</p><button className={`${btn.ghost} mt-2`} onClick={() => setSearch("")}>Clear search</button></div>}
            </div>
          </section>

          <section className="rounded-xl border border-line bg-surface" aria-label="Semantic model">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4"><div><h2 className="text-sm font-semibold">Your data, connected</h2><p className="mt-1 text-xs text-muted">Entities derived from table names and non-rejected relationships.</p></div><button className={btn.ghost} onClick={reviewRelationships}>Review joins<Icon name="chevronRight" size={14} /></button></div>
            <div className="grid max-h-[360px] gap-3 overflow-auto p-4 sm:grid-cols-2">
              {model.entities.map((entity) => (
                <div key={entity.table} className="rounded-lg border border-line bg-raised/40 p-4">
                  <div className="flex items-center gap-2"><Icon name="table" size={15} className="text-accent" /><h3 className="truncate text-sm font-semibold" title={entity.name}>{entity.name}</h3></div>
                  <p className="mt-1 truncate font-mono text-[11px] text-muted" title={entity.table}>{entity.table}</p>
                  <div className="mt-3 space-y-1.5 text-xs text-muted">
                    {entity.belongsTo.length > 0 && <p className="break-words">Belongs to <span className="font-medium text-ink">{entity.belongsTo.join(", ")}</span></p>}
                    {entity.hasMany.length > 0 && <p className="break-words">Has many <span className="font-medium text-ink">{entity.hasMany.join(", ")}</span></p>}
                    {entity.hasOne.length > 0 && <p className="break-words">Has one <span className="font-medium text-ink">{entity.hasOne.join(", ")}</span></p>}
                    {entity.belongsTo.length + entity.hasMany.length + entity.hasOne.length === 0 && <p>No detected connections</p>}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="space-y-5">
          <section className="rounded-xl border border-accent/20 bg-accent-soft/50 p-5" aria-label="Data understanding">
            <span className="mb-3 flex size-9 items-center justify-center rounded-lg bg-surface text-accent"><Icon name="sparkle" size={20} /></span>
            <h2 className="text-sm font-semibold">Build on what your data knows</h2>
            <p className="mt-2 text-[13px] leading-6 text-muted">QueryPad looks for matching keys and values, then brings those connections into your AI context.</p>
            <p className="mt-3 flex items-center gap-2 text-xs text-muted" role="status">{discovery.status === "loading" ? <><Spinner />Discovering relationships…</> : discovery.status === "error" ? <><Icon name="alert" size={14} />Discovery needs attention</> : discovery.status === "ready" ? <><Icon name="check" size={14} className="text-ok" />{relationships.length} connections available</> : "Discovery starts when two tables are loaded."}</p>
            <div className="mt-4 flex flex-wrap gap-2"><button className={btn.primary} onClick={reviewRelationships}>Review relationships</button><button className={btn.secondary} onClick={() => ui().setAssistantOpen(true)}>Ask assistant</button></div>
          </section>

          <section className="overflow-hidden rounded-xl border border-line bg-surface" aria-label="Recent queries">
            <div className="flex items-center justify-between border-b border-line px-5 py-4"><h2 className="text-sm font-semibold">Recent queries</h2><button className={btn.ghost} onClick={() => ui().showPanel("history")}>View all</button></div>
            {history.length === 0 ? <div className="p-5 text-[13px] leading-6 text-muted">Your query history will appear here. Open a dataset preview to start exploring.</div> : <div className="divide-y divide-line">{history.slice(0, 5).map((h) => <button key={h.id} className="block w-full px-5 py-3.5 text-left hover:bg-raised" onClick={() => openSnippet(h.sql, "From history")} title="Open SQL in a new tab"><div className="flex items-center gap-2"><Icon name={h.error ? "alert" : "check"} size={13} className={h.error ? "text-danger" : "text-ok"} /><span className="truncate font-mono text-xs text-ink">{h.sql.replace(/\s+/g, " ")}</span></div><p className="mt-2 text-[11px] tabular-nums text-muted">{h.error ? "Failed" : `${h.rowCount?.toLocaleString() ?? 0} rows · ${h.ms.toLocaleString()} ms`}<span className="mx-2">·</span>{new Date(h.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p></button>)}</div>}
          </section>
          <button className="flex w-full items-center gap-3 rounded-xl border border-line bg-surface p-4 text-left transition-colors hover:border-accent/40 hover:bg-raised" onClick={() => void copyAgentContext()}><Icon name="copy" size={18} className="text-accent" /><span><span className="block text-[13px] font-medium">Take your context with you</span><span className="mt-1 block text-xs text-muted">Copy schema and query context for an agent</span></span><Icon name="chevronRight" size={14} className="ml-auto text-faint" /></button>
        </div>
      </div>
    </div>
  );
}
