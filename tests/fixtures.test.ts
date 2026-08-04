/**
 * Fixture dataset guards — gate finding SG-4 (phase-0-gate.md): the repo
 * lint scripts exclude fixtures/ by path, but fixture data renders to users,
 * so this suite re-applies the §1.6 banned-claims rule (and the §1.8
 * no-emoji rule) to EVERY string in every fixture file, discovered from
 * disk. It also enforces the fixture labeling wrapper, §0 NOT #1 (no
 * supply-list-shaped content), and §1.7 (no PII-shaped keys).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { relative } from "node:path";
import { BANNED_CLAIMS } from "../config/banned-claims";
import { fixturesDir, listFixtureFiles, loadFixtureDoc } from "./helpers/fixtures";

const files = listFixtureFiles();

/** Same word-boundary + plural/possessive semantics as the lint script. */
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const claimMatchers = BANNED_CLAIMS.map((claim) => ({
  claim,
  re: new RegExp(`(?<![A-Za-z0-9])${escapeRegExp(claim)}(?:'?s)?(?![A-Za-z0-9])`, "i"),
}));

/** Same codepoint coverage as scripts/lint-no-emoji.mjs (combining marks
 * constructed via fromCodePoint so no such codepoint appears in this file). */
const EMOJI_RE = new RegExp(
  "[\\u{1F000}-\\u{1FAFF}\\u{2600}-\\u{27BF}\\u{2B00}-\\u{2BFF}" +
    "\\u{1F1E6}-\\u{1F1FF}\\u{2190}-\\u{21FF}\\u{2139}\\u{203C}\\u{2049}" +
    "\\u{3030}\\u{303D}\\u{3297}\\u{3299}]" +
    `|${String.fromCodePoint(0xfe0f)}|${String.fromCodePoint(0x20e3)}`,
  "u",
);

function* walkStrings(value: unknown, path: string): Generator<[string, string]> {
  if (typeof value === "string") {
    yield [path, value];
  } else if (Array.isArray(value)) {
    for (const [i, v] of value.entries()) yield* walkStrings(v, `${path}[${i}]`);
  } else if (value !== null && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      yield [String(k), k]; // keys are strings too
      yield* walkStrings(v, `${path}.${k}`);
    }
  }
}

describe("fixtures — SG-4: display strings free of banned claims (§1.6)", () => {
  it("discovers fixture files to scan", () => {
    expect(files.length).toBeGreaterThanOrEqual(4);
  });

  it.each(files)("%s contains no banned claim in any string or key", (file) => {
    const doc = JSON.parse(readFileSync(file, "utf8")) as unknown;
    const offenders: string[] = [];
    for (const [path, s] of walkStrings(doc, "$")) {
      for (const { claim, re } of claimMatchers) {
        if (re.test(s)) offenders.push(`${path}: "${claim}"`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it.each(files)("%s contains no emoji codepoints (§1.8)", (file) => {
    expect(EMOJI_RE.test(readFileSync(file, "utf8"))).toBe(false);
  });
});

describe("fixtures — labeling (never a plausible fabrication)", () => {
  it.each(files)("%s is wrapped as an explicit fixture document", (file) => {
    const rel = relative(fixturesDir, file);
    const doc = loadFixtureDoc<unknown>(rel);
    expect(doc._fixture, `${rel}: missing _fixture:true`).toBe(true);
    expect(doc.fixtureSet).toMatch(/^fixture:/);
    expect(doc.provenance.sourceType).toBe("fixture");
    expect(doc.provenance.source).toBe(doc.fixtureSet);
    expect(doc.provenance.limitations.length).toBeGreaterThan(0);
    expect(doc.description.toLowerCase()).toMatch(/synthetic|fixture/);
    expect(Array.isArray(doc.records)).toBe(true);
    expect(doc.records.length).toBeGreaterThan(0);
  });
});

describe("fixtures — §0 NOT #1 and §1.7 tripwires", () => {
  // No fixture may model third-party supply-list content or carry
  // PII-shaped keys. Key-name scan across every fixture document.
  const FORBIDDEN_KEY_RE =
    /teacherlist|supply_?list|list_?item|district_?pdf|child|teacher|classroom|parent|student|email|phone|address|zip|birth/i;

  it.each(files)("%s has no supply-list-shaped or PII-shaped keys", (file) => {
    const doc = JSON.parse(readFileSync(file, "utf8")) as unknown;
    const offenders: string[] = [];
    const walkKeys = (value: unknown): void => {
      if (Array.isArray(value)) value.forEach(walkKeys);
      else if (value !== null && typeof value === "object") {
        for (const [k, v] of Object.entries(value)) {
          if (FORBIDDEN_KEY_RE.test(k)) offenders.push(k);
          walkKeys(v);
        }
      }
    };
    walkKeys(doc);
    expect(offenders).toEqual([]);
  });
});
