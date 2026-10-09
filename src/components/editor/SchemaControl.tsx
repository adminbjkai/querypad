"use client";

import { useCallback, useEffect, useState } from "react";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { toast, useUiStore } from "@/stores/ui-store";
import { quoteIdent, sqlString } from "@/lib/duckdb/sql-utils";
import { Icon } from "@/components/ui/icons";
import { Dialog, Menu, btn, input } from "@/components/ui/primitives";

interface SchemaRef {
  db: string;
  schema: string;
}

const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

async function run(sql: string) {
  const { executeQuery } = await import("@/lib/duckdb/queries");
  return executeQuery(sql);
}

/** The worksheet's database and schema, with a way to create either. */
export default function SchemaControl() {
  const syncCatalog = useWorkspaceStore((s) => s.syncCatalog);
  const dbReady = useWorkspaceStore((s) => s.dbReady);
  const [current, setCurrent] = useState<SchemaRef>({ db: "memory", schema: "main" });
  const [list, setList] = useState<SchemaRef[]>([]);
  const [creating, setCreating] = useState<null | "schema" | "database">(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const cur = await run("SELECT current_database() AS db, current_schema() AS schema");
      const row = cur.rows[0];
      if (row) {
        const next = { db: String(row.db), schema: String(row.schema) };
        setCurrent(next);
        useUiStore.getState().setSchemaContext(next);
      }
      // `main` is marked internal, so filtering on that flag would hide the schema to switch back to.
      const found = await run(
        `SELECT database_name AS db, schema_name AS schema FROM duckdb_schemas()
         WHERE database_name NOT IN ('system', 'temp')
           AND schema_name NOT IN ('information_schema', 'pg_catalog', 'pg_toast', 'querypad')
         ORDER BY 1, 2`
      );
      setList(found.rows.map((r) => ({ db: String(r.db), schema: String(r.schema) })));
    } catch {
      // DuckDB might still be initializing
    }
  }, []);

  useEffect(() => {
    if (!dbReady) return;
    void refresh();
  }, [dbReady, refresh]);

  const activate = async (ref: SchemaRef) => {
    try {
      await run(`USE ${quoteIdent(ref.db)}`);
      await run(`SET schema = ${sqlString(ref.schema)}`);
      await syncCatalog(new Set());
      await refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), "error");
    }
  };

  const create = async () => {
    const trimmed = name.trim();
    if (!NAME.test(trimmed)) {
      setError("Use a letter or underscore, then letters, numbers or underscores.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (creating === "database") {
        await run(`ATTACH ':memory:' AS ${quoteIdent(trimmed)}`);
        await run(`USE ${quoteIdent(trimmed)}`);
      } else {
        await run(`CREATE SCHEMA ${quoteIdent(trimmed)}`);
        await run(`SET schema = ${sqlString(trimmed)}`);
      }
      await syncCatalog(new Set());
      await refresh();
      setCreating(null);
      setName("");
      toast(creating === "database" ? `Database ${trimmed} is current.` : `Schema ${trimmed} is current.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Menu
        label="Database and schema"
        align="left"
        items={[
          ...list.map((ref) => ({
            label: `${ref.db}.${ref.schema}`,
            icon: ref.db === current.db && ref.schema === current.schema ? ("check" as const) : undefined,
            onSelect: () => void activate(ref),
          })),
          ...(list.length > 0 ? (["divider"] as const) : []),
          { label: "New schema", icon: "plus", onSelect: () => { setCreating("schema"); setName(""); setError(null); } },
          { label: "New database", icon: "database", onSelect: () => { setCreating("database"); setName(""); setError(null); } },
        ]}
        trigger={({ toggle }) => (
          <button type="button" onClick={toggle} className="flex min-w-0 items-center gap-1.5 rounded px-1 hover:bg-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent" title="Switch, or create a schema or database">
            <span className="text-faint">Schema</span>
            <span className="truncate font-mono text-ink">{current.db}.{current.schema}</span>
            <Icon name="chevronDown" size={12} className="shrink-0 text-faint" />
          </button>
        )}
      />
      {creating && (
        <Dialog
          title={creating === "database" ? "New database" : "New schema"}
          onClose={() => setCreating(null)}
          footer={
            <>
              <button type="button" onClick={() => setCreating(null)} className={btn.secondary}>Cancel</button>
              <button type="button" onClick={() => void create()} disabled={busy || !name.trim()} className={btn.primary}>
                {busy ? "Creating…" : "Create"}
              </button>
            </>
          }
        >
          <p className="text-[13px] text-muted">
            {creating === "database"
              ? "Attaches an empty in-memory database and switches the worksheet to it. The explorer lists that database. Switch back from this menu. Tables you create are saved with this space."
              : "Creates a schema in the current database and makes it the default for new tables and views. The explorer lists that schema. Switch back from this menu."}
          </p>
          <label className="mt-3 block text-[12px] text-muted">
            Name
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void create(); }}
              className={`${input} mt-1 font-mono`}
              aria-label="Name"
              placeholder={creating === "database" ? "analytics" : "hr"}
            />
          </label>
          {error && <p role="alert" className="mt-2 text-[12px] text-danger">{error}</p>}
        </Dialog>
      )}
    </>
  );
}
