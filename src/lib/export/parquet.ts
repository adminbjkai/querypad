import { getDB, getConnection } from "@/lib/duckdb/instance";
import { splitStatements } from "@/lib/duckdb/queries";

const EXPORT_PATH = "/tmp_querypad_export.parquet";

/** Re-run the query's final statement straight into Parquet (all rows, not just the displayed ones). */
export async function exportParquet(query: string): Promise<Uint8Array> {
  const statements = splitStatements(query);
  const last = statements[statements.length - 1];
  if (!last) throw new Error("There is no query to export.");
  const db = await getDB();
  const conn = await getConnection();
  // Newline before ")" so a trailing `-- comment` can't swallow the rest of the statement.
  await conn.query(`COPY (${last}\n) TO '${EXPORT_PATH}' (FORMAT PARQUET)`);
  try {
    return new Uint8Array(await db.copyFileToBuffer(EXPORT_PATH));
  } finally {
    await db.dropFile(EXPORT_PATH).catch(() => undefined);
  }
}
