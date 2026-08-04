#!/usr/bin/env node
/**
 * §1.6 banned-claims lint. Fails (exit 1) when any banned string appears in
 * user-facing copy. The list's single source of truth is config/banned-claims.ts;
 * this script parses that file rather than duplicating the list.
 *
 * Usage: node scripts/lint-banned-claims.mjs [dir ...]
 * Default scan roots: src. Frontend phases must add their copy directories
 * (the roster of roots lives in npm run lint / package.json).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));

const SCAN_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".html", ".md", ".mdx", ".txt", ".json",
]);
const EXCLUDE_PATTERNS = [/node_modules/, /\.test\./, /banned-claims/, /fixtures/];

function loadBannedClaims() {
  const source = readFileSync(join(repoRoot, "config", "banned-claims.ts"), "utf8");
  const arrayMatch = source.match(/BANNED_CLAIMS\s*=\s*\[([\s\S]*?)\]/);
  if (!arrayMatch) {
    console.error("lint-banned-claims: could not parse config/banned-claims.ts");
    process.exit(2);
  }
  const claims = [...arrayMatch[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  if (claims.length === 0) {
    console.error("lint-banned-claims: parsed an empty banned list — refusing to pass");
    process.exit(2);
  }
  return claims;
}

function* walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    if (EXCLUDE_PATTERNS.some((p) => p.test(full))) continue;
    if (statSync(full).isDirectory()) {
      yield* walk(full);
    } else if (SCAN_EXTENSIONS.has(extname(full))) {
      yield full;
    }
  }
}

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const claims = loadBannedClaims();
const matchers = claims.map((claim) => ({
  claim,
  // Word-boundary aware and case-insensitive: "safest" must not match
  // "unsafest", but trivial plural/possessive forms ("must-haves",
  // "must-have's") must still be caught.
  re: new RegExp(`(?<![A-Za-z0-9])${escapeRegExp(claim)}(?:'?s)?(?![A-Za-z0-9])`, "i"),
}));

const scanRoots = process.argv.slice(2).length > 0 ? process.argv.slice(2) : [join(repoRoot, "src")];
const violations = [];

for (const root of scanRoots) {
  for (const file of walk(root)) {
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      for (const { claim, re } of matchers) {
        if (re.test(line)) violations.push({ file, line: i + 1, claim });
      }
    });
  }
}

if (violations.length > 0) {
  console.error(`lint-banned-claims: ${violations.length} banned claim(s) found (§1.6):`);
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line} — "${v.claim}"`);
  }
  process.exit(1);
}
console.log(`lint-banned-claims: OK (${claims.length} claims checked across ${scanRoots.length} root(s))`);
