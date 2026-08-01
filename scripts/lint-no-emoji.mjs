#!/usr/bin/env node
/**
 * §1.8 no-emoji-as-iconography lint. Fails (exit 1) when emoji codepoints
 * appear in interface source. Iconography must come from the licensed/OSS
 * icon set chosen by design-director (Phase 6) — never emoji.
 *
 * Usage: node scripts/lint-no-emoji.mjs [dir ...]
 * Default scan roots: src.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));

const SCAN_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".html", ".css", ".md", ".mdx", ".txt", ".json", ".svg",
]);
const EXCLUDE_PATTERNS = [/node_modules/, /fixtures/];

// Emoji blocks, dingbats, symbols commonly abused as icons, regional
// indicators, and the scattered emoji-capable singletons outside the main
// blocks (U+2139 info, U+203C/U+2049 bangs, U+3030/U+303D marks,
// U+3297/U+3299 circled ideographs). Intentionally broad: legitimate glyphs
// (checkmarks, arrows) must ship as SVG icons, not text symbols. VS16
// (U+FE0F) and the keycap combiner (U+20E3) are combining characters, so
// they get their own alternation rather than character-class slots.
const EMOJI_RE =
  /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{1F1E6}-\u{1F1FF}\u{2190}-\u{21FF}\u{2139}\u{203C}\u{2049}\u{3030}\u{303D}\u{3297}\u{3299}]/u;
const COMBINING_RE = /\uFE0F|\u20E3/u;

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

const scanRoots = process.argv.slice(2).length > 0 ? process.argv.slice(2) : [join(repoRoot, "src")];
const violations = [];

for (const root of scanRoots) {
  for (const file of walk(root)) {
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      const match = EMOJI_RE.exec(line) ?? COMBINING_RE.exec(line);
      if (match) {
        const codepoint = match[0].codePointAt(0).toString(16).toUpperCase();
        violations.push({ file, line: i + 1, codepoint: `U+${codepoint}` });
      }
    });
  }
}

if (violations.length > 0) {
  console.error(`lint-no-emoji: ${violations.length} emoji/symbol codepoint(s) found (§1.8):`);
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line} — ${v.codepoint}`);
  }
  process.exit(1);
}
console.log(`lint-no-emoji: OK (${scanRoots.length} root(s) scanned)`);
