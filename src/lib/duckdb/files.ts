import { getDB, getConnection } from "./instance";
import { quoteIdent, sqlString } from "./sql-utils";
import { fileExtension, sanitizeTableName } from "../utils";
import type { TableInfo, ColumnInfo } from "@/types";

/**
 * Materialize a file's bytes as a DuckDB table named `name`.
 * The bytes are registered as a virtual file only for the duration of the load and
 * dropped afterwards — the table holds the data, so keeping the buffer would double memory.
 * `buffer` is transferred to the DuckDB worker; pass a copy if you still need it.
 */
export async function loadBufferAsTable(
  name: string,
  fileName: string,
  buffer: Uint8Array
): Promise<TableInfo> {
  const db = await getDB();
  const conn = await getConnection();
  const ext = fileExtension(fileName);
  const table = quoteIdent(name);

  let virtualPath = `/${crypto.randomUUID()}-${fileName}`;
  let readFn: string;
  switch (ext) {
    case "xlsx": {
      const { xlsxToCsv } = await import("@/lib/xlsx/parse");
      virtualPath += ".csv";
      await db.registerFileBuffer(virtualPath, xlsxToCsv(buffer));
      readFn = `read_csv_auto(${sqlString(virtualPath)})`;
      break;
    }
    case "parquet":
      await db.registerFileBuffer(virtualPath, buffer);
      readFn = `read_parquet(${sqlString(virtualPath)})`;
      break;
    case "csv":
    case "tsv":
      await db.registerFileBuffer(virtualPath, buffer);
      readFn = `read_csv_auto(${sqlString(virtualPath)})`;
      break;
    case "json":
    case "jsonl":
    case "ndjson":
      await db.registerFileBuffer(virtualPath, buffer);
      readFn = `read_json_auto(${sqlString(virtualPath)})`;
      break;
    default: {
      const sql = await tryPluginFileLoader(ext, buffer, fileName);
      if (!sql) throw new Error(`Unsupported file type: .${ext}`);
      await conn.query(`CREATE OR REPLACE TABLE ${table} AS ${sql}`);
      return describeTable(name);
    }
  }

  try {
    await conn.query(`CREATE OR REPLACE TABLE ${table} AS SELECT * FROM ${readFn}`);
  } finally {
    await db.dropFile(virtualPath).catch(() => undefined);
  }
  return describeTable(name);
}

/** Load a browser File; returns the table plus an untouched copy of the bytes for persistence. */
export async function loadFileAsTable(
  file: File,
  name = sanitizeTableName(file.name)
): Promise<{ table: TableInfo; data: Uint8Array }> {
  const data = new Uint8Array(await file.arrayBuffer());
  const table = await loadBufferAsTable(name, file.name, new Uint8Array(data));
  return { table, data };
}

async function tryPluginFileLoader(
  ext: string,
  buffer: Uint8Array,
  fileName: string
): Promise<string | null> {
  const { useWorkspaceStore } = await import("@/stores/workspace-store");
  for (const plugin of useWorkspaceStore.getState().plugins) {
    for (const extension of plugin.manifest.extensions) {
      if (extension.type === "fileLoader" && extension.extensions.includes(ext)) {
        return extension.load(buffer, fileName);
      }
    }
  }
  return null;
}

async function describeTable(name: string): Promise<TableInfo> {
  const conn = await getConnection();
  const table = quoteIdent(name);
  const described = await conn.query(`DESCRIBE ${table}`);
  const columns: ColumnInfo[] = described.toArray().map((row: Record<string, unknown>) => ({
    name: String(row.column_name),
    type: String(row.column_type),
  }));
  const counted = await conn.query(`SELECT COUNT(*) AS cnt FROM ${table}`);
  const rowCount = Number(counted.toArray()[0]?.cnt ?? 0);
  return { name, columns, rowCount };
}
