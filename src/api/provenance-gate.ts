/**
 * §1.4 response gate — the API half of "a fact without provenance does not
 * render".
 *
 * Convention: every fact-bearing node in a response's `data` carries a
 * `provenanceIds` array referencing the envelope's `provenance` dictionary.
 * Before any ApiOk envelope is serialized, the gate walks `data`:
 *   - a node with an EMPTY provenanceIds array is a defect -> throw;
 *   - a referenced id missing from the dictionary is a defect -> throw;
 *   - a referenced record failing the ten-field completeness check
 *     (provenanceDefect, Phase 2 helper) is a defect -> throw.
 * The router converts the throw into a 500 `provenance_gate_failure` with NO
 * data — a response that would ship a provenance-less fact is suppressed
 * instead of shipped (§1.5).
 *
 * Route builders use filterProvenanced() to DROP (suppress) list entries
 * that cannot cite provenance before the gate ever sees them, so the gate is
 * the last line of defense, not the primary mechanism.
 */
import type { ProvenanceRecord } from "../contracts/provenance";
import { provenanceDefect } from "../ingestion/provenance";

export class ProvenanceGateError extends Error {
  constructor(detail: string) {
    super(`response rejected by the SS1.4 provenance gate: ${detail}`);
    this.name = "ProvenanceGateError";
  }
}

/** Collects every provenance id referenced by any fact node in `data`. */
export function collectProvenanceIds(data: unknown): string[] {
  const ids = new Set<string>();
  const emptyPaths: string[] = [];
  walk(data, "$", ids, emptyPaths);
  if (emptyPaths.length > 0) {
    throw new ProvenanceGateError(
      `fact node(s) with EMPTY provenanceIds at: ${emptyPaths.join(", ")}`,
    );
  }
  return [...ids].sort();
}

function walk(
  value: unknown,
  path: string,
  ids: Set<string>,
  emptyPaths: string[],
): void {
  if (Array.isArray(value)) {
    value.forEach((v, i) => walk(v, `${path}[${i}]`, ids, emptyPaths));
    return;
  }
  if (value === null || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  if ("provenanceIds" in record) {
    const list = record["provenanceIds"];
    if (!Array.isArray(list) || list.length === 0) {
      emptyPaths.push(path);
    } else {
      for (const id of list) {
        if (typeof id !== "string" || id.length === 0) emptyPaths.push(path);
        else ids.add(id);
      }
    }
  }
  if (typeof record["provenanceId"] === "string") {
    ids.add(record["provenanceId"] as string);
  }
  for (const [k, v] of Object.entries(record)) {
    walk(v, `${path}.${k}`, ids, emptyPaths);
  }
}

/**
 * Asserts that every fact node in `data` resolves to a complete §1.4 record
 * in `provenance`. Returns the referenced ids (sorted) for meta/debugging.
 */
export function assertResponseProvenance(
  data: unknown,
  provenance: Record<string, ProvenanceRecord>,
): string[] {
  const ids = collectProvenanceIds(data);
  for (const id of ids) {
    const record = provenance[id];
    if (!record) {
      throw new ProvenanceGateError(`referenced provenance id "${id}" is not in the envelope`);
    }
    const defect = provenanceDefect(record);
    if (defect) {
      throw new ProvenanceGateError(`record "${id}" incomplete: ${defect}`);
    }
  }
  return ids;
}

export interface ProvenancedFilterResult<T> {
  kept: T[];
  /** Count of entries suppressed for missing provenance (§1.5 over guessing). */
  suppressedCount: number;
}

/** Drops entries whose provenanceIds are empty/unresolvable — suppression, not error. */
export function filterProvenanced<T extends { provenanceIds: readonly string[] }>(
  entries: readonly T[],
  provenance: Record<string, ProvenanceRecord>,
): ProvenancedFilterResult<T> {
  const kept: T[] = [];
  let suppressedCount = 0;
  for (const entry of entries) {
    const resolvable =
      entry.provenanceIds.length > 0 &&
      entry.provenanceIds.every(
        (id) => provenance[id] !== undefined && provenanceDefect(provenance[id]!) === null,
      );
    if (resolvable) kept.push(entry);
    else suppressedCount += 1;
  }
  return { kept, suppressedCount };
}
