import * as duckdb from "@duckdb/duckdb-wasm";

let dbInstance: duckdb.AsyncDuckDB | null = null;
let initPromise: Promise<duckdb.AsyncDuckDB> | null = null;
/** DuckDB-Wasm allows one query on a connection at a time. Overlapping calls drop results. */
let queryChain: Promise<void> = Promise.resolve();

function serialize(conn: duckdb.AsyncDuckDBConnection): duckdb.AsyncDuckDBConnection {
  return new Proxy(conn, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (prop !== "query" || typeof value !== "function") return value;
      return (...args: unknown[]) => {
        const next = queryChain.then(() => (value as (...a: unknown[]) => Promise<unknown>).apply(target, args));
        queryChain = next.then(() => undefined, () => undefined);
        return next;
      };
    },
  });
}

export async function getDB(): Promise<duckdb.AsyncDuckDB> {
  if (dbInstance) return dbInstance;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    // scripts/copy-duckdb-wasm.mjs places the module under the package version, so the
    // immutable cache header on /duckdb/* can never serve a stale build after an upgrade.
    const mainModule = `/duckdb/${duckdb.PACKAGE_VERSION}/duckdb-eh.wasm`;
    const DUCKDB_BUNDLES: duckdb.DuckDBBundles = {
      mvp: {
        mainModule,
        mainWorker: new URL(
          "@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js",
          import.meta.url
        ).toString(),
      },
      eh: {
        mainModule,
        mainWorker: new URL(
          "@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js",
          import.meta.url
        ).toString(),
      },
    };

    const bundle = await duckdb.selectBundle(DUCKDB_BUNDLES);
    const worker = new Worker(bundle.mainWorker!);
    // Warnings only: at the default level every statement is echoed to the console.
    const logger = new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING);
    const db = new duckdb.AsyncDuckDB(logger, worker);
    await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
    dbInstance = db;
    return db;
  })();

  return initPromise;
}

/**
 * Create the internal `querypad` schema (relationships / keys, empty until discovery publishes).
 * Runs before the connection is handed out and again after `resetDatabase` drops it, so a
 * query that names `querypad.keys` never finds it missing.
 */
export async function ensureInternalSchema(conn: duckdb.AsyncDuckDBConnection): Promise<void> {
  const { relationshipsSql } = await import("./catalog-sql");
  for (const statement of relationshipsSql([], {}, () => "")) {
    await conn.query(statement);
  }
}

let connPromise: Promise<duckdb.AsyncDuckDBConnection> | null = null;
/** The same connection without the queueing proxy, for `exclusive`. */
let rawConn: duckdb.AsyncDuckDBConnection | null = null;

/** The shared connection; every caller waits until the internal schema exists. */
export function getConnection(): Promise<duckdb.AsyncDuckDBConnection> {
  connPromise ??= (async () => {
    const db = await getDB();
    rawConn = await db.connect();
    const conn = serialize(rawConn);
    try {
      await ensureInternalSchema(conn);
    } catch (err) {
      console.warn("Failed to initialize base querypad schema:", err);
    }
    return conn;
  })().catch((err) => {
    connPromise = null; // let the next call retry
    throw err;
  });
  return connPromise;
}

/**
 * Run `fn` with the connection to itself: it waits its turn like a `query`, and nothing else
 * starts on the connection until it settles. Streamed reads (`send`) need this — the queue only
 * covers `query`, and a query arriving mid-stream ends the stream early without an error.
 * Use the connection `fn` receives (its own calls are not queued, so they can't deadlock).
 */
export async function exclusive<T>(fn: (conn: duckdb.AsyncDuckDBConnection) => Promise<T>): Promise<T> {
  await getConnection();
  const conn = rawConn!;
  const next = queryChain.then(() => fn(conn));
  queryChain = next.then(() => undefined, () => undefined);
  return next;
}
