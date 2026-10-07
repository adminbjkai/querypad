"use client";

import { useMemo } from "react";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useUiStore } from "@/stores/ui-store";
import { buildSemanticModel } from "@/lib/discovery/semantic-model";
import { relationshipKey } from "@/lib/discovery/relationships";
import { Icon } from "@/components/ui/icons";
import { Spinner, btn } from "@/components/ui/primitives";

/** Entities derived from table names and non-rejected relationships, plus discovery status. */
export default function SemanticModel() {
  const tables = useWorkspaceStore((s) => s.tables);
  const discovery = useWorkspaceStore((s) => s.discovery);
  const verdicts = useWorkspaceStore((s) => s.relationshipVerdicts);
  const relationships = useMemo(
    () => discovery.relationships.filter((r) => verdicts[relationshipKey(r)] !== "rejected"),
    [discovery.relationships, verdicts]
  );
  const model = useMemo(() => buildSemanticModel(tables.map((t) => t.name), relationships, 0), [tables, relationships]);

  return (
    <section aria-label="Semantic model" className="mt-10">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[14px] font-semibold leading-5 text-ink">Your data, connected</h2>
          <p className="mt-0.5 flex items-center gap-1.5 text-[12px] text-muted" role="status">
            {discovery.status === "loading" ? (
              <><Spinner />Discovering relationships…</>
            ) : discovery.status === "error" ? (
              <><Icon name="alert" size={14} className="text-warn" />Discovery needs attention</>
            ) : discovery.status === "ready" ? (
              <><Icon name="check" size={14} className="text-ok" />{relationships.length} {relationships.length === 1 ? "connection" : "connections"} found</>
            ) : (
              "Discovery starts when two tables are loaded."
            )}
          </p>
        </div>
        <button className={btn.secondary} onClick={() => useUiStore.getState().showPanel("joins")}>
          Review joins<Icon name="chevronRight" size={14} />
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {model.entities.map((entity) => (
          <div key={entity.table} className="rounded-xl border border-line bg-surface p-4 transition-colors hover:border-line-strong">
            <div className="flex items-center gap-2">
              <Icon name="table" size={16} className="text-accent" />
              <h3 className="truncate text-[14px] font-semibold leading-5 text-ink" title={entity.name}>{entity.name}</h3>
            </div>
            <p className="mt-1 truncate font-mono text-[11px] text-muted" title={entity.table}>{entity.table}</p>
            <div className="mt-3 space-y-1.5 text-[12px] text-muted">
              {entity.belongsTo.length > 0 && <p className="break-words">Belongs to <span className="font-medium text-ink">{entity.belongsTo.join(", ")}</span></p>}
              {entity.hasMany.length > 0 && <p className="break-words">Has many <span className="font-medium text-ink">{entity.hasMany.join(", ")}</span></p>}
              {entity.hasOne.length > 0 && <p className="break-words">Has one <span className="font-medium text-ink">{entity.hasOne.join(", ")}</span></p>}
              {entity.belongsTo.length + entity.hasMany.length + entity.hasOne.length === 0 && <p>No detected connections</p>}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
