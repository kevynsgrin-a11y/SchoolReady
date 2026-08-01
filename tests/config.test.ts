import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BANNED_CLAIMS } from "../config/banned-claims";
import { BRAND } from "../config/brand";
import { DEFAULT_FLAGS } from "../config/flags";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

const WALK_EXCLUDES = [/node_modules/, /\.git\//, /\.wrangler/, /coverage/, /dist/];

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (WALK_EXCLUDES.some((p) => p.test(full + (statSync(full).isDirectory() ? "/" : "")))) continue;
    if (statSync(full).isDirectory()) {
      yield* walk(full);
    } else {
      yield full;
    }
  }
}

describe("flags — §0 launch posture", () => {
  it("ships with fixture mode ON", () => {
    expect(DEFAULT_FLAGS.fixtureMode).toBe(true);
  });

  it("ships with every live source OFF", () => {
    const sources = Object.entries(DEFAULT_FLAGS.liveSources);
    expect(sources.length).toBeGreaterThan(0);
    for (const [id, enabled] of sources) {
      expect(enabled, `live source "${id}" must default OFF`).toBe(false);
    }
  });

  it("configures a circuit breaker with sane positive thresholds", () => {
    expect(DEFAULT_FLAGS.circuitBreaker.failureThreshold).toBeGreaterThan(0);
    expect(DEFAULT_FLAGS.circuitBreaker.cooldownSeconds).toBeGreaterThan(0);
    expect(DEFAULT_FLAGS.circuitBreaker.staleAfterSeconds).toBeGreaterThan(0);
  });
});

describe("banned claims — §1.6", () => {
  it("contains every string mandated by §1.6", () => {
    const required = [
      "must-have",
      "guaranteed fit",
      "school approved",
      "guaranteed savings",
      "guaranteed delivery",
      "safest",
      "best for every child",
    ];
    for (const claim of required) {
      expect(BANNED_CLAIMS).toContain(claim);
    }
  });
});

describe("brand isolation — §0", () => {
  it("exports a non-empty working name and wordmark", () => {
    expect(BRAND.name.length).toBeGreaterThan(0);
    expect(BRAND.wordmark.length).toBeGreaterThan(0);
  });

  it("hardcodes the brand name nowhere outside config/brand.ts", () => {
    const brandRe = new RegExp(BRAND.name, "i");
    const allowlisted = join(repoRoot, "config", "brand.ts");
    const scannedExtensions = [
      ".ts", ".tsx", ".js", ".mjs", ".json", ".jsonc",
      ".html", ".md", ".yml", ".yaml", ".txt",
    ];
    const offenders: string[] = [];
    for (const file of walk(repoRoot)) {
      if (file === allowlisted) continue;
      if (!scannedExtensions.includes(extname(file))) continue;
      if (brandRe.test(readFileSync(file, "utf8"))) offenders.push(file);
    }
    expect(offenders, `brand name leaked into: ${offenders.join(", ")}`).toEqual([]);
  });
});
