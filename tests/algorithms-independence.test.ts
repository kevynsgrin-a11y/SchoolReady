/**
 * §1.1 structural independence — the scoring code can never see money.
 *
 * Two guards, both computed from DISK so they keep holding as the codebase
 * grows (specifically: when src/monetization/ appears in Phase 9):
 *  1. The transitive import closure of src/algorithms/ contains no module
 *     whose path matches a monetization pattern, contains only repo-internal
 *     modules (src/ or config/), and uses no bare package imports at all.
 *  2. The comment-stripped source of every module in the FULL transitive
 *     import closure (not just the entry files — gate finding P4-2, closed
 *     in Phase 5) contains no economics identifier
 *     (commission/payout/referral/monetization/...).
 *
 * The behavioral half (byte-identical ranking under an injected 40%
 * commission) lives in tests/algorithms-match.test.ts.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const algorithmsDir = join(repoRoot, "src", "algorithms");

const IMPORT_RE = /(?:from\s+|import\s*\(\s*)["']([^"']+)["']/g;

function importSpecifiers(file: string): string[] {
  const source = readFileSync(file, "utf8");
  return [...source.matchAll(IMPORT_RE)].map((m) => m[1]!);
}

function resolveRelative(fromFile: string, spec: string): string {
  const base = resolve(dirname(fromFile), spec);
  for (const candidate of [base, `${base}.ts`, join(base, "index.ts")]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  throw new Error(`unresolvable import "${spec}" from ${fromFile}`);
}

const entryFiles = readdirSync(algorithmsDir)
  .filter((f) => f.endsWith(".ts"))
  .map((f) => join(algorithmsDir, f))
  .sort();

/** BFS transitive closure over relative imports; collects bare imports too. */
function importClosure(): { closure: string[]; bareImports: string[] } {
  const seen = new Set<string>(entryFiles);
  const bare = new Set<string>();
  const queue = [...entryFiles];
  while (queue.length > 0) {
    const file = queue.pop()!;
    for (const spec of importSpecifiers(file)) {
      if (!spec.startsWith(".")) {
        bare.add(`${relative(repoRoot, file)} -> ${spec}`);
        continue;
      }
      const resolved = resolveRelative(file, spec);
      if (!seen.has(resolved)) {
        seen.add(resolved);
        queue.push(resolved);
      }
    }
  }
  return { closure: [...seen].sort(), bareImports: [...bare].sort() };
}

const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

describe("algorithms — §1.1 import-graph independence from monetization", () => {
  it("discovers the algorithm modules (test is not vacuous)", () => {
    expect(entryFiles.length).toBeGreaterThanOrEqual(9);
  });

  it("transitive import closure contains no monetization-patterned module path", () => {
    const { closure } = importClosure();
    const offenders = closure
      .map((f) => relative(repoRoot, f))
      .filter((p) => /(monetization|commission|payout|referral)/i.test(p));
    expect(offenders).toEqual([]);
  });

  it("closure stays inside src/ and config/ (no external reachability)", () => {
    const { closure } = importClosure();
    const outside = closure
      .map((f) => relative(repoRoot, f))
      .filter((p) => !p.startsWith("src/") && !p.startsWith("config/"));
    expect(outside).toEqual([]);
  });

  it("uses no bare package imports anywhere in the scoring closure", () => {
    const { bareImports } = importClosure();
    expect(bareImports).toEqual([]);
  });

  it("comment-stripped sources of the FULL import closure contain no economics identifier (P4-2)", () => {
    const { closure } = importClosure();
    // Sanity: the closure is strictly larger than the entry set, so this
    // scan genuinely covers contracts/config modules a TS-only economics
    // field could hide in.
    expect(closure.length).toBeGreaterThan(entryFiles.length);
    const offenders: string[] = [];
    for (const file of closure) {
      const code = stripComments(readFileSync(file, "utf8"));
      const hits = code.match(/\b(commission|payout|referral|monetization|kickback)\b/gi);
      if (hits) offenders.push(`${relative(repoRoot, file)}: ${hits.join(", ")}`);
    }
    expect(offenders).toEqual([]);
  });
});
