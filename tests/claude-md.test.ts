import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BANNED_CLAIMS } from "../config/banned-claims";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const claudeMd = readFileSync(join(repoRoot, "CLAUDE.md"), "utf8");

describe("CLAUDE.md restates the locked definition and invariants", () => {
  it("contains the §0 locked product definition", () => {
    expect(claudeMd).toContain("PRODUCT DEFINITION (LOCKED");
    expect(claudeMd).toContain("never scrape, cache, republish, or mirror");
    expect(claudeMd).toContain("fixture-mode validation beta");
  });

  it("restates all eight §1 invariants", () => {
    const anchors = [
      "Affiliate commission is never an input",
      "≥3 independent signal families",
      "Every user-facing fact carries provenance",
      "Suppression beats guessing",
      "Banned claims",
      "PII never persists",
      "No emoji is ever used as interface iconography",
      "No ad slot, sponsored unit, upsell, or interstitial",
    ];
    for (const anchor of anchors) {
      expect(claudeMd, `missing invariant anchor: "${anchor}"`).toContain(anchor);
    }
  });

  it("lists every banned claim verbatim", () => {
    for (const claim of BANNED_CLAIMS) {
      expect(claudeMd).toContain(claim);
    }
  });

  it("tracks per-invariant enforcement status", () => {
    expect(claudeMd).toContain("Invariant enforcement status");
    expect(claudeMd).toContain("ENFORCED (Phase 0)");
  });
});
