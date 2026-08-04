/**
 * Live adapter stubs (Phase 2). §0 launch posture: every liveSources flag
 * defaults OFF, so the live implementation of every adapter is a stub that
 * throws LiveSourceDisabledError unconditionally — it contains NO fetch code
 * and can never touch the network, regardless of flag state. Real live
 * implementations land in a later phase only after credentials + licensing
 * (registry licensing flag + compliance register, Phase 10).
 */
import type { SourceId } from "../../../config/flags";
import type { SourceAdapter } from "../types";
import { LiveSourceDisabledError } from "../types";
import { SOURCE_REGISTRATIONS } from "../registry";

export function createLiveStub<T>(sourceId: SourceId): SourceAdapter<T> {
  return {
    sourceId,
    mode: "live",
    fetchBatch(): Promise<never> {
      const reg = SOURCE_REGISTRATIONS[sourceId];
      return Promise.reject(
        new LiveSourceDisabledError(
          sourceId,
          `Phase 2 ships no live fetch code for "${reg.displayName}"; ` +
            `licensing basis "${reg.licensing.basis}" ` +
            `(allowLiveFetch=${reg.licensing.allowLiveFetch}). Use the ` +
            `fixture adapter (fixture set "${reg.fixtureSet}").`,
        ),
      );
    },
  };
}
