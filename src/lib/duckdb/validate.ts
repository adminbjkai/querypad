import type { AsyncDuckDBConnection } from "@duckdb/duckdb-wasm";
import { getDB } from "./instance";
import { splitStatements } from "./queries";
import { isReadOnlyStatement, leading } from "./catalog-sql";

export type SqlCheck = { status: "ok" } | { status: "failed"; error: string } | { status: "skipped"; reason: string };

/**
 * Statements whose effects escape the check's transaction are not test-run: files,
 * extensions and settings, and transaction control (a COMMIT would make writes real).
 */
const UNSAFE = /^(attach|detach|install|load|set|reset|pragma|copy|export|import|use|checkpoint|vacuum|call|begin|start|commit|end|abort|rollback)\b/i;

let checkConnection: AsyncDuckDBConnection | null = null;

/**
 * Compile SQL against the current tables without changing anything: on a separate
 * connection, inside a transaction that is always rolled back. Read-only statements are
 * only planned (EXPLAIN), so nothing expensive runs.
 */
export function checkSql(sql: string): Promise<SqlCheck> {
  // One check at a time: they share a connection and its transaction.
  const run = queue.then(() => runCheck(sql));
  queue = run.catch(() => undefined);
  return run;
}

let queue: Promise<unknown> = Promise.resolve();

async function runCheck(sql: string): Promise<SqlCheck> {
  const statements = splitStatements(sql);
  if (statements.length === 0) return { status: "skipped", reason: "empty" };
  if (statements.some((s) => UNSAFE.test(leading(s)))) {
    return { status: "skipped", reason: "contains statements that can't be test-run safely" };
  }

  checkConnection ??= await (await getDB()).connect();
  const conn = checkConnection;
  await conn.query("BEGIN TRANSACTION");
  try {
    for (const statement of statements) {
      await conn.query(isReadOnlyStatement(statement) ? `EXPLAIN ${statement}` : statement);
    }
    return { status: "ok" };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    // A concurrent change on the main connection isn't the SQL's fault.
    if (/conflict/i.test(error)) return { status: "skipped", reason: "the data changed while checking" };
    return { status: "failed", error };
  } finally {
    await conn.query("ROLLBACK").catch(() => undefined);
  }
}
