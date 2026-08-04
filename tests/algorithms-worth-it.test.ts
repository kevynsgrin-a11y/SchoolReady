/**
 * Worth-it matrix — dimensions stay visible and separate; NEVER collapsed
 * into one number. Type-level and runtime enforcement.
 */
import { describe, expect, it } from "vitest";
import * as worthItModule from "../src/algorithms/worth-it";
import {
  assembleWorthItMatrix,
  WORTH_IT_DIMENSIONS,
  WorthItValidationError,
  type WorthItDimensionEntry,
  type WorthItMatrix,
} from "../src/algorithms/worth-it";

const entry = (
  overrides: Partial<WorthItDimensionEntry> &
    Pick<WorthItDimensionEntry, "dimension">,
): WorthItDimensionEntry => ({
  rating: "adequate",
  evidenceGrade: "b",
  summary: "fixture-labeled dimension summary",
  provenanceIds: ["prov:test:worth-it"],
  ...overrides,
});

const fullEntries = (): WorthItDimensionEntry[] =>
  WORTH_IT_DIMENSIONS.map((dimension) => entry({ dimension }));

describe("worth-it — matrix stays a matrix", () => {
  it("assembles the five dimensions in canonical order", () => {
    const matrix = assembleWorthItMatrix(
      "glue-stick",
      [...fullEntries()].reverse(), // input order must not matter
      "2026-08-01T00:00:00.000Z",
    );
    expect(matrix.dimensions.map((d) => d.dimension)).toEqual([
      "durability",
      "cost_per_use",
      "requirement_fit",
      "safety",
      "hype_vs_evidence",
    ]);
  });

  it("TYPE-LEVEL: WorthItMatrix has no aggregate/score/total/rank key", () => {
    type ForbiddenAggregateKeys =
      | "score"
      | "overall"
      | "overallScore"
      | "total"
      | "aggregate"
      | "rank"
      | "composite"
      | "verdict";
    type Violations = Extract<keyof WorthItMatrix, ForbiddenAggregateKeys>;
    // Compilation fails here if such a field is ever added to the type.
    const typeLevelProof: [Violations] extends [never] ? "ok" : never = "ok";
    expect(typeLevelProof).toBe("ok");
  });

  it("RUNTIME: no key anywhere in a matrix looks like an aggregate", () => {
    const matrix = assembleWorthItMatrix(
      "glue-stick",
      fullEntries(),
      "2026-08-01T00:00:00.000Z",
    );
    const keys: string[] = [];
    const walk = (value: unknown): void => {
      if (Array.isArray(value)) value.forEach(walk);
      else if (value !== null && typeof value === "object") {
        for (const [k, v] of Object.entries(value)) {
          keys.push(k);
          walk(v);
        }
      }
    };
    walk(matrix);
    expect(
      keys.filter((k) => /score|overall|total|aggregate|rank|composite/i.test(k)),
    ).toEqual([]);
  });

  it("a matrix contains no numeric leaf at all — ratings are categorical", () => {
    const matrix = assembleWorthItMatrix(
      "glue-stick",
      fullEntries(),
      "2026-08-01T00:00:00.000Z",
    );
    const numbers: unknown[] = [];
    const walk = (value: unknown): void => {
      if (typeof value === "number") numbers.push(value);
      else if (Array.isArray(value)) value.forEach(walk);
      else if (value !== null && typeof value === "object") {
        Object.values(value).forEach(walk);
      }
    };
    walk(matrix);
    expect(numbers).toEqual([]);
  });

  it("the module exports no collapse/aggregate function", () => {
    const exports = Object.keys(worthItModule);
    expect(
      exports.filter((name) => /aggregate|overall|collapse|combine|total|score/i.test(name)),
    ).toEqual([]);
  });
});

describe("worth-it — evidence gates (§1.4/§1.5)", () => {
  it("rejects a missing or duplicate dimension", () => {
    expect(() =>
      assembleWorthItMatrix("glue-stick", fullEntries().slice(1), "2026-08-01T00:00:00.000Z"),
    ).toThrow(WorthItValidationError);
    expect(() =>
      assembleWorthItMatrix(
        "glue-stick",
        [...fullEntries(), entry({ dimension: "safety" })],
        "2026-08-01T00:00:00.000Z",
      ),
    ).toThrow(WorthItValidationError);
  });

  it("a rating with insufficient evidence is rejected — must be 'unknown'", () => {
    const entries = fullEntries().map((e) =>
      e.dimension === "durability" ? { ...e, evidenceGrade: "insufficient" as const } : e,
    );
    expect(() =>
      assembleWorthItMatrix("glue-stick", entries, "2026-08-01T00:00:00.000Z"),
    ).toThrow(/insufficient evidence/);
  });

  it("a rating without provenance is rejected (§1.4)", () => {
    const entries = fullEntries().map((e) =>
      e.dimension === "safety" ? { ...e, provenanceIds: [] as const } : e,
    );
    expect(() =>
      assembleWorthItMatrix("glue-stick", entries, "2026-08-01T00:00:00.000Z"),
    ).toThrow(/without\s+provenance/);
  });

  it("'unknown' with insufficient evidence is the permitted honest state", () => {
    const entries = fullEntries().map((e) =>
      e.dimension === "hype_vs_evidence"
        ? {
            ...e,
            rating: "unknown" as const,
            evidenceGrade: "insufficient" as const,
            provenanceIds: [] as const,
          }
        : e,
    );
    const matrix = assembleWorthItMatrix("glue-stick", entries, "2026-08-01T00:00:00.000Z");
    expect(matrix.dimensions[4]!.rating).toBe("unknown");
  });
});
