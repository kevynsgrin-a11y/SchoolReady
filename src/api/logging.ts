/**
 * Allowlist-based structured logging (§1.7 as code).
 *
 * The logger REFUSES fields rather than trusting call sites: a field logs
 * only when its key is on LOG_FIELD_ALLOWLIST and its value is a primitive.
 * Free text, request bodies, parsed drafts, and review payloads are
 * structurally unloggable — there is no API to pass them. The zero-PII cycle
 * tests capture every emitted event and scan it for seeded PII.
 */

export interface ApiLogEvent {
  event: string;
  fields: Readonly<Record<string, string | number | boolean>>;
}

export type ApiLogSink = (event: ApiLogEvent) => void;

/**
 * Keys that may ever appear in a log line. Opaque ids and counts only —
 * no key for text, names, addresses, sizes, budgets, or contact info exists.
 */
export const LOG_FIELD_ALLOWLIST: ReadonlySet<string> = new Set([
  "route",
  "method",
  "status",
  "durationMs",
  "code",
  "sessionPresent",
  "householdPresent",
  "intakeId",
  "intakeMethod",
  "itemCount",
  "itemsNeedingReview",
  "skippedLineCount",
  "redactionCount",
  "redactionCategories",
  "overallConfidence",
  "objectKey",
  "pageCount",
  "ocrMeanConfidence",
  "lineCount",
  "listId",
  "requirementCount",
  "memberOrdinal",
  "optionCount",
  "frontierSize",
  "feasible",
  "suppressedCount",
  "excludedCount",
  "sourceId",
  "stale",
  "circuitState",
  "degraded",
  "bucket",
  "allowed",
  "retryAfterSeconds",
  "alertKind",
  "subscriptionId",
  "entitlementPresent",
  "rowsDeleted",
  "eventType",
  "queueMessageCount",
  "reason",
]);

export interface ApiLogger {
  log(event: string, fields?: Record<string, unknown>): void;
}

const isPrimitive = (v: unknown): v is string | number | boolean =>
  typeof v === "string" || typeof v === "number" || typeof v === "boolean";

/**
 * Builds the allowlist logger. Disallowed keys and non-primitive values are
 * DROPPED (never serialized); the drop is itself surfaced as a counted,
 * content-free field so misuse is visible without leaking anything.
 */
export function createAllowlistLogger(sink: ApiLogSink): ApiLogger {
  return {
    log(event: string, fields: Record<string, unknown> = {}): void {
      const safe: Record<string, string | number | boolean> = {};
      let dropped = 0;
      for (const [key, value] of Object.entries(fields)) {
        if (LOG_FIELD_ALLOWLIST.has(key) && isPrimitive(value)) {
          safe[key] = value;
        } else {
          dropped += 1;
        }
      }
      if (dropped > 0) safe["droppedFieldCount"] = dropped;
      sink({ event, fields: safe });
    },
  };
}

/** droppedFieldCount is the one key the logger may add on its own. */
export const LOGGER_SELF_FIELDS: readonly string[] = ["droppedFieldCount"];
