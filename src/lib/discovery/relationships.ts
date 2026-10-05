import type { ColumnProfile, TableProfile } from "../../types";
import type { Relationship } from "../../types/discovery";
import { quoteIdent } from "../duckdb/sql-utils";
import {
  NAME_SIMILARITY_FLOOR,
  OVERLAP_FLOOR,
  STRONG_NAME_SIMILARITY,
  isIdLike,
  cardinalityShapeScore,
  confidence,
  isTypeCompatible,
  nameSimilarity,
  typeMatchScore,
} from "./signals";

/**
 * Engine-agnostic query interface. Both the browser (DuckDB-Wasm) and the Node CLI
 * (`@duckdb/node-api`) can supply a runner; the discovery logic never touches a
 * concrete connection.
 */
export type QueryRunner = (sql: string) => Promise<Record<string, unknown>[]>;

/** Stable directional identity for a relationship (foreign endpoint → key endpoint). */
export function relationshipKey(rel: Relationship): string {
  return `${rel.from.table}.${rel.from.column}->${rel.to.table}.${rel.to.column}`;
}

/** Minimum blended confidence for an edge to be reported. */
const CONFIDENCE_FLOOR = 50;

/** Ceiling for name-only edges (foreign table empty): always shown as "verify manually". */
const NAME_ONLY_CEILING = 60;

function toCount(value: unknown): number {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number") return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** A column is a primary-key candidate when it is unique and has no nulls. */
function isKeyCandidate(column: ColumnProfile, rowCount: number): boolean {
  return (
    rowCount > 0 &&
    column.distinctCount !== null &&
    column.distinctCount === rowCount &&
    column.nullCount === 0
  );
}

/** A column is "unique" if its distinct count equals the row count. */
function isUnique(column: ColumnProfile, rowCount: number): boolean {
  return rowCount > 0 && column.distinctCount !== null && column.distinctCount === rowCount;
}

interface Candidate {
  keyTable: string;
  keyColumn: ColumnProfile;
  foreignTable: string;
  foreignColumn: ColumnProfile;
  foreignRowCount: number;
  nameScore: number;
}

/**
 * Discover directed foreign-key relationships across a set of profiled tables.
 * Returns edges `from.column ↳ to.column` sorted by descending confidence.
 */
export async function discoverRelationships(
  profiles: TableProfile[],
  runner: QueryRunner
): Promise<Relationship[]> {
  // 1. Generate pruned candidates (name + type filtered) to avoid O(n²) overlap scans.
  const candidates: Candidate[] = [];
  for (const keyProfile of profiles) {
    for (const keyColumn of keyProfile.columns) {
      if (!isKeyCandidate(keyColumn, keyProfile.rowCount)) continue;

      for (const foreignProfile of profiles) {
        if (foreignProfile.tableName === keyProfile.tableName) continue;
        for (const foreignColumn of foreignProfile.columns) {
          if (!isTypeCompatible(foreignColumn.kind, keyColumn.kind)) continue;
          const nameScore = nameSimilarity(
            foreignColumn.name,
            keyColumn.name,
            keyProfile.tableName
          );
          if (nameScore < NAME_SIMILARITY_FLOOR) continue;

          // A column that is its own table's surrogate primary key (unique, non-null)
          // is only a foreign key when its name explicitly references the target;
          // otherwise overlapping integer id ranges produce false positives.
          if (
            isKeyCandidate(foreignColumn, foreignProfile.rowCount) &&
            nameScore < STRONG_NAME_SIMILARITY
          ) {
            continue;
          }

          // Uniqueness alone does not make a column a key: a small price list has
          // unique prices, so any money column that happens to match them would be
          // "explained" as a foreign key into it. A non-id target is only credible
          // when the foreign column names it outright (sku -> sku, region_cd -> region_cd).
          if (!isIdLike(keyColumn.name, keyProfile.tableName) && nameScore < STRONG_NAME_SIMILARITY) {
            continue;
          }
          candidates.push({
            keyTable: keyProfile.tableName,
            keyColumn,
            foreignTable: foreignProfile.tableName,
            foreignColumn,
            foreignRowCount: foreignProfile.rowCount,
            nameScore,
          });
        }
      }
    }
  }

  // 2. Run the decisive value-overlap query for each surviving candidate.
  const edges: Relationship[] = [];
  for (const candidate of candidates) {
    if (candidate.foreignRowCount === 0) {
      const edge = nameOnlyEdge(candidate);
      if (edge) edges.push(edge);
      continue;
    }
    const overlap = await measureOverlap(candidate, runner);
    if (overlap < OVERLAP_FLOOR) continue;

    const signals = {
      valueOverlap: overlap,
      nameSimilarity: candidate.nameScore,
      typeMatch: typeMatchScore(
        candidate.foreignColumn.type,
        candidate.keyColumn.type,
        candidate.foreignColumn.kind,
        candidate.keyColumn.kind
      ),
      cardinalityShape: cardinalityShapeScore(
        true,
        isUnique(candidate.foreignColumn, candidate.foreignRowCount)
      ),
    };
    const score = confidence(signals);
    if (score < CONFIDENCE_FLOOR) continue;

    edges.push({
      from: { table: candidate.foreignTable, column: candidate.foreignColumn.name },
      to: { table: candidate.keyTable, column: candidate.keyColumn.name },
      confidence: score,
      cardinality: signals.cardinalityShape === 0.8 ? "one-to-one" : "many-to-one",
      signals,
    });
  }

  // 3. A foreign column references a single table: keep only its strongest target
  //    (disambiguates spurious overlaps against unrelated id ranges), then collapse
  //    mirrored one-to-one directions.
  return dedupeEdges(bestPerForeignColumn(edges));
}

/**
 * An empty table (e.g. `CREATE TABLE … WHERE FALSE`) has no values to compare, so its
 * columns can only be linked by an explicit name reference to an id-like key.
 */
function nameOnlyEdge(candidate: Candidate): Relationship | null {
  if (candidate.nameScore < STRONG_NAME_SIMILARITY) return null;
  if (!isIdLike(candidate.keyColumn.name, candidate.keyTable)) return null;
  const signals = {
    valueOverlap: 0,
    nameSimilarity: candidate.nameScore,
    typeMatch: typeMatchScore(
      candidate.foreignColumn.type,
      candidate.keyColumn.type,
      candidate.foreignColumn.kind,
      candidate.keyColumn.kind
    ),
    cardinalityShape: 1,
  };
  if (signals.typeMatch === 0) return null;
  // Scale the non-value signals (max weight 0.45) into 0..NAME_ONLY_CEILING.
  const partial = 0.25 * signals.nameSimilarity + 0.1 * signals.typeMatch + 0.1 * signals.cardinalityShape;
  return {
    from: { table: candidate.foreignTable, column: candidate.foreignColumn.name },
    to: { table: candidate.keyTable, column: candidate.keyColumn.name },
    confidence: Math.round((partial / 0.45) * NAME_ONLY_CEILING),
    cardinality: "many-to-one",
    signals,
    evidence: "name",
  };
}

/** Keep at most one edge per foreign column — the highest-confidence target. */
function bestPerForeignColumn(edges: Relationship[]): Relationship[] {
  const best = new Map<string, Relationship>();
  for (const edge of edges) {
    const k = `${edge.from.table}.${edge.from.column}`;
    const existing = best.get(k);
    const better =
      !existing ||
      edge.confidence > existing.confidence ||
      (edge.confidence === existing.confidence &&
        edge.signals.nameSimilarity > existing.signals.nameSimilarity);
    if (better) best.set(k, edge);
  }
  return [...best.values()];
}

async function measureOverlap(candidate: Candidate, runner: QueryRunner): Promise<number> {
  const foreign = quoteIdent(candidate.foreignTable);
  const fc = quoteIdent(candidate.foreignColumn.name);
  const key = quoteIdent(candidate.keyTable);
  const kc = quoteIdent(candidate.keyColumn.name);

  // Cast both sides to VARCHAR so numeric-vs-text key conventions still match.
  const sql = `
    SELECT
      COUNT(DISTINCT CAST(f.${fc} AS VARCHAR)) AS distinct_fk,
      COUNT(DISTINCT CASE WHEN k.key IS NOT NULL THEN CAST(f.${fc} AS VARCHAR) END) AS matched_fk
    FROM ${foreign} f
    LEFT JOIN (SELECT DISTINCT CAST(${kc} AS VARCHAR) AS key FROM ${key}) k
      ON CAST(f.${fc} AS VARCHAR) = k.key
    WHERE f.${fc} IS NOT NULL
  `;

  try {
    const rows = await runner(sql);
    const row = rows[0] ?? {};
    const distinct = toCount(row.distinct_fk);
    const matched = toCount(row.matched_fk);
    return distinct === 0 ? 0 : matched / distinct;
  } catch {
    return 0;
  }
}

function edgeKey(rel: Relationship): string {
  const a = `${rel.from.table}.${rel.from.column}`;
  const b = `${rel.to.table}.${rel.to.column}`;
  return [a, b].sort().join("::");
}

function dedupeEdges(edges: Relationship[]): Relationship[] {
  const best = new Map<string, Relationship>();
  for (const edge of edges) {
    const k = edgeKey(edge);
    const existing = best.get(k);
    if (!existing || edge.confidence > existing.confidence) best.set(k, edge);
  }
  return [...best.values()].sort((a, b) => b.confidence - a.confidence);
}
