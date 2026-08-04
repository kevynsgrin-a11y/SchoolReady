/**
 * Refresh-cycle job definitions (Phase 2). Queues/Workflows contracts only:
 * the queue binding + consumer wiring lands with the API worker (Phase 5),
 * because provisioning a queue for a fixture-only beta that performs no
 * network refreshes would be dead infrastructure. These types ARE the
 * contract that wiring codes against.
 *
 * Refresh intervals are OPERATIONAL config (how often we re-read a source),
 * not user-facing facts; the staleAfterSeconds badge threshold lives in
 * config/flags.ts and is enforced by the SWR cache regardless of intervals.
 */
import type { Flags, SourceId } from "../../config/flags";
import { SOURCE_IDS } from "../contracts/source";
import type { IsoTimestamp } from "../contracts/provenance";

/** Queue name reserved for ingestion refresh jobs (provisioned Phase 5). */
export const INGESTION_QUEUE_NAME = "ingestion-refresh";

export type RefreshReason = "scheduled" | "manual" | "probe";

/** Message shape for the ingestion refresh queue. */
export interface RefreshJobMessage {
  kind: "source_refresh";
  sourceId: SourceId;
  requestedAt: IsoTimestamp;
  reason: RefreshReason;
}

/**
 * Per-source refresh cadence in seconds. Recalls and offers refresh inside
 * the 6h staleAfterSeconds window; the school directory and tax calendar
 * change slowly.
 */
export const REFRESH_INTERVALS_SECONDS: Record<SourceId, number> = {
  nces_ccd: 7 * 24 * 3600,
  cpsc_recalls: 6 * 3600,
  state_tax_holidays: 24 * 3600,
  affiliate_feeds: 6 * 3600,
};

/**
 * Plan one refresh cycle. Fixture mode still refreshes (re-seeding caches
 * from fixture documents keeps envelopes fresh and exercises the pipeline);
 * live refreshes additionally require the source's flag — which this
 * function checks so a scheduler can never enqueue live work for a
 * flagged-off source.
 */
export function planRefreshJobs(flags: Flags, now: IsoTimestamp): RefreshJobMessage[] {
  return SOURCE_IDS.filter(
    (sourceId) => flags.fixtureMode || flags.liveSources[sourceId],
  ).map((sourceId) => ({
    kind: "source_refresh",
    sourceId,
    requestedAt: now,
    reason: "scheduled",
  }));
}
