/**
 * Source registry + refresh-job tests: every SourceId is registered with a
 * complete licensing flag (fetched/cached/stored/displayed permissions), the
 * registry mirrors config/flags.ts, no source models list content (§0 NOT
 * #1), and the refresh planner can never enqueue live work for a flagged-off
 * source.
 */
import { describe, expect, it } from "vitest";
import { DEFAULT_FLAGS } from "../config/flags";
import type { Flags } from "../config/flags";
import { CIRCUIT_STATES, LICENSE_BASES, SOURCE_IDS } from "../src/contracts/source";
import {
  SOURCE_DATA_KINDS,
  SOURCE_REGISTRATIONS,
} from "../src/ingestion/registry";
import { planRefreshJobs, REFRESH_INTERVALS_SECONDS } from "../src/ingestion/jobs";

describe("registry — completeness against config/flags.ts", () => {
  it("SOURCE_IDS mirrors DEFAULT_FLAGS.liveSources exactly", () => {
    expect([...SOURCE_IDS].sort()).toEqual(
      Object.keys(DEFAULT_FLAGS.liveSources).sort(),
    );
  });

  it("every SourceId has a registration whose sourceId matches its key", () => {
    for (const id of SOURCE_IDS) {
      const reg = SOURCE_REGISTRATIONS[id];
      expect(reg, `missing registration for ${id}`).toBeDefined();
      expect(reg.sourceId).toBe(id);
      expect(reg.displayName.length).toBeGreaterThan(0);
      expect(reg.provider.length).toBeGreaterThan(0);
    }
    expect(Object.keys(SOURCE_REGISTRATIONS).sort()).toEqual([...SOURCE_IDS].sort());
  });
});

describe("registry — licensing flag on every source", () => {
  it("every registration carries the full licensing flag (fetch/cache/persist/display)", () => {
    for (const id of SOURCE_IDS) {
      const lic = SOURCE_REGISTRATIONS[id].licensing;
      expect(LICENSE_BASES).toContain(lic.basis);
      expect(typeof lic.allowLiveFetch).toBe("boolean");
      expect(typeof lic.allowCache).toBe("boolean");
      expect(typeof lic.allowPersist).toBe("boolean");
      expect(typeof lic.allowDisplay).toBe("boolean");
      expect(typeof lic.attributionRequired).toBe("boolean");
      expect(lic.notes.length).toBeGreaterThan(0);
    }
  });

  it("no source is licensed for live fetch in this build (launch posture)", () => {
    for (const id of SOURCE_IDS) {
      expect(
        SOURCE_REGISTRATIONS[id].licensing.allowLiveFetch,
        `${id} must not be live-fetch licensed before credentials + Phase 10`,
      ).toBe(false);
    }
  });

  it("unlicensed commercial feeds are deny-all until contracts land", () => {
    const lic = SOURCE_REGISTRATIONS.affiliate_feeds.licensing;
    expect(lic.basis).toBe("commercial_contract_required");
    expect(lic.allowCache).toBe(false);
    expect(lic.allowPersist).toBe(false);
    expect(lic.allowDisplay).toBe(false);
  });
});

describe("registry — §0 NOT #1 (no list content source can exist)", () => {
  it("every dataKind comes from the closed vocabulary, which has no supply-list member", () => {
    for (const kind of SOURCE_DATA_KINDS) {
      expect(kind).not.toMatch(/list|pdf|document/i);
    }
    for (const id of SOURCE_IDS) {
      expect(SOURCE_DATA_KINDS).toContain(SOURCE_REGISTRATIONS[id].dataKind);
    }
  });

  it("fixture sets are fixture-namespaced", () => {
    for (const id of SOURCE_IDS) {
      expect(SOURCE_REGISTRATIONS[id].fixtureSet).toMatch(/^fixture:/);
    }
  });
});

describe("jobs — refresh planning honors flags", () => {
  const now = "2026-08-04T00:00:00.000Z";

  it("defines a positive refresh interval for every source", () => {
    for (const id of SOURCE_IDS) {
      expect(REFRESH_INTERVALS_SECONDS[id]).toBeGreaterThan(0);
    }
  });

  it("fixture mode plans a fixture refresh for every source", () => {
    const jobs = planRefreshJobs(DEFAULT_FLAGS, now);
    expect(jobs.map((j) => j.sourceId).sort()).toEqual([...SOURCE_IDS].sort());
    for (const job of jobs) {
      expect(job.kind).toBe("source_refresh");
      expect(job.requestedAt).toBe(now);
    }
  });

  it("with fixture mode off, only flag-enabled sources are planned (none by default)", () => {
    const liveOnlyFlags: Flags = { ...DEFAULT_FLAGS, fixtureMode: false };
    expect(planRefreshJobs(liveOnlyFlags, now)).toEqual([]);
    const oneEnabled: Flags = {
      ...liveOnlyFlags,
      liveSources: { ...liveOnlyFlags.liveSources, cpsc_recalls: true },
    };
    expect(planRefreshJobs(oneEnabled, now).map((j) => j.sourceId)).toEqual([
      "cpsc_recalls",
    ]);
  });
});

describe("contracts — circuit vocabulary sanity", () => {
  it("exposes the three breaker states used by source_health", () => {
    expect(CIRCUIT_STATES).toEqual(["closed", "open", "half_open"]);
  });
});
