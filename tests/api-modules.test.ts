/**
 * Phase 5 module tests (node): rate limiting, Turnstile + Stripe fixture
 * verifiers (live stubs THROW — no network code exists), allowlist logging
 * (§1.7), the §1.4 provenance response gate, catalog candidate derivation,
 * and sales-tax lookup. Injected clocks throughout.
 */
import { describe, expect, it } from "vitest";
import { MemoryKv } from "../src/ingestion/swr-cache";
import { provenanceDefect } from "../src/ingestion/provenance";
import type { ProvenanceRecord } from "../src/contracts/provenance";
import {
  checkRateLimit,
  RATE_LIMIT_RULES,
} from "../src/api/rate-limit";
import {
  createFixtureTurnstileVerifier,
  createLiveTurnstileStub,
  FIXTURE_TURNSTILE_PASS_TOKEN,
  TurnstileDisabledError,
} from "../src/api/turnstile";
import {
  createFixtureStripeVerifier,
  createLiveStripeStub,
  FIXTURE_STRIPE_SIGNATURE,
  StripeDisabledError,
} from "../src/api/stripe";
import { createAllowlistLogger, LOG_FIELD_ALLOWLIST } from "../src/api/logging";
import type { ApiLogEvent } from "../src/api/logging";
import {
  assertResponseProvenance,
  collectProvenanceIds,
  filterProvenanced,
  ProvenanceGateError,
} from "../src/api/provenance-gate";
import { deriveCandidates, lookupSalesTax } from "../src/api/catalog";
import { parseCookies, buildSessionCookie, sha256Hex } from "../src/api/session";
import { loadFixtureLibrary, T0 } from "./helpers/api";
import { createProductFeedFixtureAdapter } from "../src/ingestion/adapters/product-feeds";

const fixtures = loadFixtureLibrary();

async function offerRecords() {
  const adapter = createProductFeedFixtureAdapter(fixtures.offers, () => T0);
  const batch = await adapter.fetchBatch();
  return batch.records;
}

describe("rate limiting — KV token bucket, injected clock", () => {
  const rule = { bucket: "test", capacity: 3, refillPerSecond: 1 / 60 };

  it("allows a burst up to capacity, then denies with retryAfterSeconds", async () => {
    const kv = new MemoryKv();
    let now = T0;
    const clock = () => now;
    for (let i = 0; i < 3; i += 1) {
      const d = await checkRateLimit(kv, rule, "subject-a", clock);
      expect(d.allowed).toBe(true);
    }
    const denied = await checkRateLimit(kv, rule, "subject-a", clock);
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterSeconds).toBe(60);
    // Refill: one token after 60 seconds.
    now = T0 + 60_000;
    const refilled = await checkRateLimit(kv, rule, "subject-a", clock);
    expect(refilled.allowed).toBe(true);
  });

  it("tracks subjects independently (opaque hashes, never identity)", async () => {
    const kv = new MemoryKv();
    const clock = () => T0;
    for (let i = 0; i < 3; i += 1) await checkRateLimit(kv, rule, "subject-a", clock);
    const other = await checkRateLimit(kv, rule, "subject-b", clock);
    expect(other.allowed).toBe(true);
  });

  it("ships upload and alerts buckets per CLAUDE.md §2", () => {
    expect(Object.keys(RATE_LIMIT_RULES).sort()).toEqual(["alerts", "upload"]);
    for (const rule of Object.values(RATE_LIMIT_RULES)) {
      expect(rule.capacity).toBeGreaterThan(0);
      expect(rule.refillPerSecond).toBeGreaterThan(0);
    }
  });
});

describe("Turnstile — fixture verifier + throwing live stub", () => {
  it("fixture verifier accepts only the labeled fixture token", async () => {
    const verifier = createFixtureTurnstileVerifier();
    expect((await verifier.verify(FIXTURE_TURNSTILE_PASS_TOKEN)).ok).toBe(true);
    expect(await verifier.verify("some-other-token")).toEqual({
      ok: false,
      reason: "invalid_token",
    });
    expect(await verifier.verify(null)).toEqual({ ok: false, reason: "missing_token" });
    expect(await verifier.verify("")).toEqual({ ok: false, reason: "missing_token" });
  });

  it("live stub throws TurnstileDisabledError (no fetch code exists)", async () => {
    const stub = createLiveTurnstileStub();
    expect(stub.mode).toBe("live");
    await expect(stub.verify("anything")).rejects.toBeInstanceOf(TurnstileDisabledError);
    await expect(stub.verify("anything")).rejects.toThrow(/No network request was made/);
  });
});

describe("Stripe webhooks — fixture verifier + throwing live stub", () => {
  const event = {
    _fixture: true,
    eventId: "evt-fixture-1",
    eventType: "season_pass.purchased",
    householdRef: "hh_test",
    paymentRef: "fixture-payment-1",
    validFrom: "2026-08-01T00:00:00.000Z",
    validUntil: "2027-08-01T00:00:00.000Z",
  };

  it("verifies a labeled fixture event with the fixture signature", async () => {
    const verifier = createFixtureStripeVerifier();
    const result = await verifier.verify(JSON.stringify(event), FIXTURE_STRIPE_SIGNATURE);
    expect(result).toEqual({ ok: true, event });
  });

  it("rejects missing/bad signatures and malformed or unlabeled events", async () => {
    const verifier = createFixtureStripeVerifier();
    expect(await verifier.verify(JSON.stringify(event), null)).toEqual({
      ok: false,
      reason: "missing_signature",
    });
    expect(await verifier.verify(JSON.stringify(event), "wrong")).toEqual({
      ok: false,
      reason: "bad_signature",
    });
    expect(await verifier.verify("{not json", FIXTURE_STRIPE_SIGNATURE)).toEqual({
      ok: false,
      reason: "malformed_event",
    });
    const unlabeled = { ...event, _fixture: undefined };
    expect(
      await verifier.verify(JSON.stringify(unlabeled), FIXTURE_STRIPE_SIGNATURE),
    ).toEqual({ ok: false, reason: "malformed_event" });
  });

  it("live stub throws StripeDisabledError", async () => {
    const stub = createLiveStripeStub();
    await expect(stub.verify("{}", "sig")).rejects.toBeInstanceOf(StripeDisabledError);
  });
});

describe("logging — §1.7 allowlist enforcement", () => {
  it("passes allowlisted primitive fields and drops everything else", () => {
    const events: ApiLogEvent[] = [];
    const logger = createAllowlistLogger((e) => events.push(e));
    logger.log("test_event", {
      route: "/api/plan/merge",
      status: 200,
      // Disallowed key — must be dropped:
      studentText: "Zephyrine Quatermain room 4127",
      // Allowlisted key with non-primitive value — must be dropped:
      itemCount: { nested: "object" },
    });
    expect(events).toHaveLength(1);
    const fields = events[0]!.fields;
    expect(fields["route"]).toBe("/api/plan/merge");
    expect(fields["status"]).toBe(200);
    expect(fields["studentText"]).toBeUndefined();
    expect(fields["itemCount"]).toBeUndefined();
    expect(fields["droppedFieldCount"]).toBe(2);
    expect(JSON.stringify(events)).not.toContain("Zephyrine");
  });

  it("has no allowlist key that could carry free text or identity", () => {
    for (const key of LOG_FIELD_ALLOWLIST) {
      expect(key).not.toMatch(/text|name|email|phone|address|body|content|note/i);
    }
  });
});

describe("provenance gate — §1.4 API half", () => {
  const record = (id: string): ProvenanceRecord => ({
    id,
    source: "fixture:test",
    sourceType: "fixture",
    observedAt: "2026-08-01T00:00:00.000Z",
    retrievedAt: "2026-08-01T00:00:00.000Z",
    geography: "US",
    transformVersion: "none",
    freshness: "fresh",
    confidence: 1,
    limitations: "test",
    correctionStatus: "none",
    createdAt: "2026-08-01T00:00:00.000Z",
  });

  it("accepts data whose fact nodes resolve to complete records", () => {
    const data = { lines: [{ value: 1, provenanceIds: ["p1"] }] };
    expect(assertResponseProvenance(data, { p1: record("p1") })).toEqual(["p1"]);
  });

  it("throws on an EMPTY provenanceIds array (fact without provenance)", () => {
    expect(() => collectProvenanceIds({ fact: { provenanceIds: [] } })).toThrow(
      ProvenanceGateError,
    );
  });

  it("throws when a referenced id is missing from the envelope", () => {
    expect(() =>
      assertResponseProvenance({ fact: { provenanceIds: ["ghost"] } }, {}),
    ).toThrow(/ghost/);
  });

  it("throws when the referenced record is incomplete", () => {
    const bad = { ...record("p1"), source: "" };
    expect(() =>
      assertResponseProvenance({ fact: { provenanceIds: ["p1"] } }, { p1: bad }),
    ).toThrow(ProvenanceGateError);
  });

  it("filterProvenanced suppresses (drops) unresolvable entries instead of shipping them", () => {
    const entries = [
      { id: "keep", provenanceIds: ["p1"] },
      { id: "drop-empty", provenanceIds: [] as string[] },
      { id: "drop-ghost", provenanceIds: ["ghost"] },
    ];
    const { kept, suppressedCount } = filterProvenanced(entries, { p1: record("p1") });
    expect(kept.map((e) => e.id)).toEqual(["keep"]);
    expect(suppressedCount).toBe(2);
  });
});

describe("catalog derivation — offers + fixture entity resolution", () => {
  it("derives 9 candidates across 3 slugs with complete provenance", async () => {
    const records = await offerRecords();
    const derivation = deriveCandidates(records, fixtures.catalog, fixtures.logistics, () => T0);
    expect(derivation.unresolvedOffers).toEqual([]);
    const slugs = [...derivation.bySlug.keys()].sort();
    expect(slugs).toEqual(["composition-notebook", "crayons", "glue-stick"]);
    let total = 0;
    for (const candidates of derivation.bySlug.values()) {
      total += candidates.length;
      for (const cand of candidates) {
        expect(cand.provenanceIds.length).toBeGreaterThanOrEqual(3);
        for (const id of cand.provenanceIds) {
          expect(provenanceDefect(derivation.provenance[id]!)).toBeNull();
        }
      }
    }
    expect(total).toBe(9);
  });

  it("excludes offers without a RESOLVED mapping — §1.5, visible reason", async () => {
    const records = await offerRecords();
    const catalog = {
      ...fixtures.catalog,
      records: fixtures.catalog.records.map((r) =>
        r.sku === "FXM-GLUE-06" ? { ...r, resolutionStatus: "ambiguous" as const } : r,
      ),
    };
    const derivation = deriveCandidates(records, catalog, fixtures.logistics, () => T0);
    expect(derivation.unresolvedOffers).toEqual([
      {
        offerKey: "fixture-mart:FXM-GLUE-06",
        reason: "variant resolution status is ambiguous",
      },
    ]);
    expect(derivation.bySlug.get("glue-stick")!.length).toBe(2);
  });

  it("labels every delivery estimate as a fixture ASSUMPTION, unknown included", async () => {
    const records = await offerRecords();
    const derivation = deriveCandidates(records, fixtures.catalog, fixtures.logistics, () => T0);
    expect(derivation.assumptions.length).toBe(3);
    for (const assumption of derivation.assumptions) {
      expect(assumption.basis).toBe("fixture_assumption");
    }
    const supplyCo = derivation.bySlug
      .get("glue-stick")!
      .find((c) => c.retailerSlug === "fixture-supply-co")!;
    expect(supplyCo.estimatedDeliveryDays).toBeNull();
  });
});

describe("sales tax lookup — labeled placeholder rates", () => {
  it("returns the fixture rate with provenance for a known state", () => {
    const tax = lookupSalesTax("TX", fixtures.taxRates, () => T0);
    expect(tax.rate).toBe(0.0825);
    expect(tax.assumption.basis).toBe("fixture_assumption");
    expect(tax.provenance).not.toBeNull();
    expect(provenanceDefect(tax.provenance!)).toBeNull();
  });

  it("labels the gap instead of guessing for unknown/missing states", () => {
    for (const state of [null, "ZZ"]) {
      const tax = lookupSalesTax(state, fixtures.taxRates, () => T0);
      expect(tax.rate).toBe(0);
      expect(tax.assumption.value).toContain("NOT estimated");
      expect(tax.provenance).toBeNull();
    }
  });
});

describe("session primitives — opaque cookie", () => {
  it("hashes tokens (sha-256 hex) and round-trips cookie parsing", async () => {
    const hash = await sha256Hex("st_fixture");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    const cookie = buildSessionCookie("st_fixture");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    const parsed = parseCookies(cookie.split(";")[0] ?? null);
    expect(parsed["k8p_sid"]).toBe("st_fixture");
  });
});
