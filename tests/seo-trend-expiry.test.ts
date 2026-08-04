/**
 * Phase 8 — trend-page expiry: trend pages carry evidence timestamps and
 * auto-expire into review (noindex + review flag) once their newest
 * observation ages past the window DERIVED from the trend engine's own
 * decay constants (never an invented number).
 */
import { describe, expect, it } from "vitest";
import { DEFAULT_TREND_CONFIG } from "../src/algorithms/trend";
import { TREND_PAGE_EXPIRY_DAYS } from "../src/seo/config";
import { evidenceTimestamps, trendPageStatus } from "../src/seo/trend-expiry";
import { resolveProgrammaticPolicy } from "../src/seo/route-metadata";
import { T0_ISO, record } from "./helpers/ui";

const NOW = Date.parse(T0_ISO);
const DAY_MS = 86_400_000;

describe("expiry window — derived from the trend engine, not invented", () => {
  it("equals the age at which the engine's freshness weight hits its floor", () => {
    expect(TREND_PAGE_EXPIRY_DAYS).toBe(
      Math.ceil(
        DEFAULT_TREND_CONFIG.tauDays * Math.log(1 / DEFAULT_TREND_CONFIG.freshnessFloor),
      ),
    );
    expect(TREND_PAGE_EXPIRY_DAYS).toBeGreaterThan(0);
  });
});

describe("evidence timestamps", () => {
  it("sorts observation dates oldest to newest", () => {
    const timestamps = evidenceTimestamps([
      record({ observedAt: "2026-08-02T00:00:00.000Z" }),
      record({ observedAt: "2026-07-30T00:00:00.000Z" }),
      record({ observedAt: "2026-08-01T00:00:00.000Z" }),
    ]);
    expect(timestamps).toEqual([
      "2026-07-30T00:00:00.000Z",
      "2026-08-01T00:00:00.000Z",
      "2026-08-02T00:00:00.000Z",
    ]);
  });
});

describe("trend page status", () => {
  it("fresh evidence: not expired, expiry stamped from the newest observation", () => {
    const observed = new Date(NOW - DAY_MS).toISOString();
    const status = trendPageStatus([record({ observedAt: observed })], NOW);
    expect(status.newestEvidenceAt).toBe(observed);
    expect(status.expired).toBe(false);
    expect(status.review).toBe(false);
    expect(Date.parse(status.expiresAt!)).toBe(
      Date.parse(observed) + TREND_PAGE_EXPIRY_DAYS * DAY_MS,
    );
  });

  it("auto-expires into review at the boundary and beyond", () => {
    const observed = new Date(NOW - TREND_PAGE_EXPIRY_DAYS * DAY_MS).toISOString();
    const atBoundary = trendPageStatus([record({ observedAt: observed })], NOW);
    expect(atBoundary.expired).toBe(true);
    expect(atBoundary.review).toBe(true);

    const wellPast = trendPageStatus(
      [record({ observedAt: "2026-01-01T00:00:00.000Z" })],
      NOW,
    );
    expect(wellPast.expired).toBe(true);
    expect(wellPast.review).toBe(true);
  });

  it("no dated evidence = already expired, routed to review (suppression beats guessing)", () => {
    const status = trendPageStatus([], NOW);
    expect(status).toEqual({
      newestEvidenceAt: null,
      expiresAt: null,
      expired: true,
      review: true,
    });
  });
});

describe("programmatic policy — gate + expiry combine", () => {
  const fresh = trendPageStatus([record({ observedAt: T0_ISO })], NOW);
  const expired = trendPageStatus([record({ observedAt: "2026-01-01T00:00:00.000Z" })], NOW);

  it("passing gate + fresh trend evidence = indexable", () => {
    expect(resolveProgrammaticPolicy({ gate: { pass: true }, trend: fresh })).toEqual({
      robots: "index,follow",
      review: false,
    });
  });

  it("expired trend evidence = noindex + review, even when the gate passes", () => {
    expect(resolveProgrammaticPolicy({ gate: { pass: true }, trend: expired })).toEqual({
      robots: "noindex",
      review: true,
    });
  });

  it("failed gate = noindex regardless of trend freshness", () => {
    expect(
      resolveProgrammaticPolicy({
        gate: { pass: false, failures: [{ check: "min_fields", detail: "test" }] },
        trend: fresh,
      }),
    ).toEqual({ robots: "noindex", review: false });
  });

  it("non-trend programmatic pages resolve on the gate alone", () => {
    expect(resolveProgrammaticPolicy({ gate: { pass: true }, trend: null }).robots).toBe(
      "index,follow",
    );
  });
});
