/**
 * Phase 10 (compliance-officer) — the licensing register is machine-checked
 * against the code it governs:
 *  - docs/compliance/licensing-register.md covers 100% of the sources in
 *    src/ingestion/registry.ts (both directions: no missing entry, no
 *    phantom entry);
 *  - every entry rules on all seven permissions (fetch/cache/store/
 *    transform/display/index/alert) and states a go-live precondition;
 *  - the Fetch/Cache/Store/Display rulings AGREE with the code-level
 *    licensing flags, and no source may be live-flagged without a
 *    "Permitted" fetch ruling (register-before-live, CLAUDE.md posture);
 *  - the affiliate-network posture section reflects the actual Phase 9
 *    fixture-only registry;
 *  - every code/test path cited by the compliance docs exists (the COPPA
 *    posture document cannot silently rot);
 *  - the compliance docs themselves contain no §1.6 banned claim (docs/ is
 *    outside the lint roots, so the check lives here).
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BANNED_CLAIMS } from "../config/banned-claims";
import { DEFAULT_FLAGS } from "../config/flags";
import { SOURCE_REGISTRATIONS } from "../src/ingestion/registry";
import {
  AFFILIATE_NETWORKS,
  RETAILER_NETWORK_MAP,
  getNetwork,
} from "../src/monetization/networks";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const registerPath = join(repoRoot, "docs", "compliance", "licensing-register.md");
const coppaPath = join(repoRoot, "docs", "compliance", "coppa-posture.md");
const register = readFileSync(registerPath, "utf8");
const coppa = readFileSync(coppaPath, "utf8");

const registeredIds = Object.keys(SOURCE_REGISTRATIONS).sort();

/** `### \`<sourceId>\` ...` headings in the register. */
const registerHeadingIds = (): string[] =>
  [...register.matchAll(/^### `([a-z0-9_]+)`/gm)].map((m) => m[1]!).sort();

/** The register section for one source id (heading to next heading). */
function sourceSection(id: string): string {
  const start = register.search(new RegExp(String.raw`^### \x60${id}\x60`, "m"));
  expect(start, `register has no section for ${id}`).toBeGreaterThanOrEqual(0);
  const rest = register.slice(start);
  const next = /\n##/.exec(rest.slice(4));
  return next ? rest.slice(0, next.index + 4) : rest;
}

/** Ruling cell text for one permission row inside a section. */
function ruling(section: string, permission: string): string {
  const escaped = permission.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(String.raw`^\| ${escaped} \| ([^|]+) \|`, "m");
  const match = re.exec(section);
  expect(match, `missing "| ${permission} |" ruling row`).not.toBeNull();
  return match![1]!.trim();
}

describe("licensing register — 100% coverage of registered sources", () => {
  it("has exactly one entry per registered source — no missing, no phantom", () => {
    expect(registerHeadingIds()).toEqual(registeredIds);
  });

  const PERMISSION_ROWS = [
    "Fetch (live)",
    "Cache",
    "Store",
    "Transform",
    "Display",
    "Index",
    "Alert",
  ] as const;

  for (const id of registeredIds) {
    it(`${id}: rules on all seven permissions, states basis + go-live precondition`, () => {
      const section = sourceSection(id);
      for (const row of PERMISSION_ROWS) {
        const cell = ruling(section, row);
        expect(
          /^(Permitted|Denied)\b/.test(cell),
          `${id} "${row}" ruling must start with Permitted or Denied (got: "${cell}")`,
        ).toBe(true);
      }
      expect(section).toContain(`- Basis: \`${SOURCE_REGISTRATIONS[id as keyof typeof SOURCE_REGISTRATIONS].licensing.basis}\``);
      expect(section).toContain("Go-live precondition");
    });

    it(`${id}: Fetch/Cache/Store/Display rulings agree with the code-level licensing flags`, () => {
      const section = sourceSection(id);
      const lic = SOURCE_REGISTRATIONS[id as keyof typeof SOURCE_REGISTRATIONS].licensing;
      const agrees = (row: string, allowed: boolean): void => {
        const cell = ruling(section, row);
        expect(
          cell.startsWith("Permitted"),
          `${id} "${row}": register says "${cell}" but code flag is ${allowed}`,
        ).toBe(allowed);
      };
      agrees("Fetch (live)", lic.allowLiveFetch);
      agrees("Cache", lic.allowCache);
      agrees("Store", lic.allowPersist);
      agrees("Display", lic.allowDisplay);
    });
  }

  it("register-before-live: a live-flagged source would need a Permitted fetch ruling", () => {
    for (const [id, enabled] of Object.entries(DEFAULT_FLAGS.liveSources)) {
      if (!enabled) continue; // none in this build — the rule arms on flip
      expect(ruling(sourceSection(id), "Fetch (live)").startsWith("Permitted")).toBe(true);
    }
    // And in this build, nothing is live and nothing is fetch-permitted.
    expect(Object.values(DEFAULT_FLAGS.liveSources).every((v) => !v)).toBe(true);
  });

  it("restates §0 NOT #1: list repositories are not and can never be sources", () => {
    expect(register).toContain("Not sources, by design");
    expect(register).toMatch(/TeacherLists/);
  });
});

describe("licensing register — affiliate-network posture matches Phase 9 reality", () => {
  it("documents every registered fixture network by id", () => {
    for (const network of AFFILIATE_NETWORKS) {
      expect(register).toContain(network.networkId);
    }
    expect(register).toContain("fixture-tag-");
  });

  it("code side re-verified: every network is fixture-mode with a fixture tag", () => {
    expect(AFFILIATE_NETWORKS.length).toBeGreaterThan(0);
    for (const network of AFFILIATE_NETWORKS) {
      expect(network.mode).toBe("fixture");
      expect(network.tag.startsWith("fixture-tag-")).toBe(true);
    }
    for (const networkId of Object.values(RETAILER_NETWORK_MAP)) {
      expect(getNetwork(networkId)?.mode).toBe("fixture");
    }
  });
});

describe("compliance docs — cited paths exist and copy stays clean", () => {
  const citedPaths = (doc: string): string[] =>
    [...doc.matchAll(/`((?:src|tests|tests-workers|migrations|config|scripts|docs)\/[^`\s]+)`/g)].map(
      (m) => m[1]!,
    );

  it("every code/test path cited by the COPPA posture document exists", () => {
    const paths = citedPaths(coppa);
    expect(paths.length).toBeGreaterThanOrEqual(10);
    for (const p of paths) {
      expect(existsSync(join(repoRoot, p)), `coppa-posture.md cites missing path: ${p}`).toBe(true);
    }
  });

  it("every code/test path cited by the licensing register exists", () => {
    for (const p of citedPaths(register)) {
      expect(existsSync(join(repoRoot, p)), `licensing-register.md cites missing path: ${p}`).toBe(true);
    }
  });

  it("COPPA posture covers the four §0 NOT #5 claims with citations", () => {
    for (const anchor of [
      "No child accounts",
      "No child-directed data collection",
      "No targeted advertising",
      "src/api/session.ts",
      "migrations/0003_schools_households.sql",
      "tests/parsing-pii.test.ts",
      "tests-workers/compliance-deletion.test.ts",
    ]) {
      expect(coppa, `coppa-posture.md missing anchor: ${anchor}`).toContain(anchor);
    }
  });

  it("neither compliance doc contains a §1.6 banned claim (docs are outside the lint roots)", () => {
    const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    for (const doc of [register, coppa]) {
      for (const claim of BANNED_CLAIMS) {
        const re = new RegExp(`(?<![A-Za-z0-9])${escape(claim)}(?:'?s)?(?![A-Za-z0-9])`, "i");
        expect(re.test(doc), `banned claim "${claim}" in a compliance doc`).toBe(false);
      }
    }
  });
});
