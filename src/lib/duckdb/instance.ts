import * as duckdb from "@duckdb/duckdb-wasm";

let dbInstance: duckdb.AsyncDuckDB | null = null;
let connInstance: duckdb.AsyncDuckDBConnection | null = null;
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
    const logger = new duckdb.ConsoleLogger();
    const db = new duckdb.AsyncDuckDB(logger, worker);
    await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
    dbInstance = db;
    return db;
  })();

  return initPromise;
}

let schemaInitialized = false;

export async function getConnection(): Promise<duckdb.AsyncDuckDBConnection> {
  if (connInstance) return connInstance;
  const db = await getDB();
  connInstance = serialize(await db.connect());
  if (!schemaInitialized) {
    schemaInitialized = true;
    try {
      const { relationshipsSql } = await import("./catalog-sql");
      for (const statement of relationshipsSql([], {}, () => "")) {
        await connInstance.query(statement);
      }
    } catch (err) {
      console.warn("Failed to initialize base querypad schema:", err);
    }
  }
  return connInstance;
}
