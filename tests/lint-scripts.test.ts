import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const bannedScript = join(repoRoot, "scripts", "lint-banned-claims.mjs");
const emojiScript = join(repoRoot, "scripts", "lint-no-emoji.mjs");

// Constructed dynamically so these literals never appear in source scanned by
// any lint layer.
const seededClaim = ["must", "have"].join("-");
const seededEmoji = String.fromCodePoint(0x1f4da);

let tempDirs: string[] = [];

function makeDir(fileName: string, content: string): string {
  const dir = mkdtempSync(join(tmpdir(), "lint-seed-"));
  tempDirs.push(dir);
  writeFileSync(join(dir, fileName), content);
  return dir;
}

function runScript(script: string, dir: string) {
  return spawnSync("node", [script, dir], { encoding: "utf8" });
}

afterEach(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
  tempDirs = [];
});

describe("banned-claims lint — §1.6 seeded violation", () => {
  it("fails on a seeded banned claim", () => {
    const dir = makeDir("copy.md", `This is a ${seededClaim} item for fall.`);
    const result = runScript(bannedScript, dir);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(seededClaim);
  });

  it("is word-boundary aware (no false positive inside larger words)", () => {
    const dir = makeDir("copy.md", "The unsafest-looking option was removed.");
    const result = runScript(bannedScript, dir);
    expect(result.status).toBe(0);
  });

  it("catches trivial plural and possessive forms", () => {
    const dir = makeDir("copy.md", `All the ${seededClaim}s for this season.`);
    const result = runScript(bannedScript, dir);
    expect(result.status).toBe(1);
  });

  it("passes clean copy", () => {
    const dir = makeDir("copy.md", "A sturdy binder that meets the list requirement.");
    const result = runScript(bannedScript, dir);
    expect(result.status).toBe(0);
  });

  it("passes the real src tree (the wired lint target)", () => {
    const result = runScript(bannedScript, join(repoRoot, "src"));
    expect(result.status, result.stderr).toBe(0);
  });
});

describe("no-emoji lint — §1.8 seeded violation", () => {
  it("fails on a seeded emoji", () => {
    const dir = makeDir("ui.tsx", `<span>${seededEmoji} Books</span>`);
    const result = runScript(emojiScript, dir);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("U+1F4DA");
  });

  it("fails on emoji-capable singletons outside the main blocks", () => {
    const infoSymbol = String.fromCodePoint(0x2139);
    const dir = makeDir("ui.tsx", `<span>${infoSymbol} Details</span>`);
    const result = runScript(emojiScript, dir);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("U+2139");
  });

  it("passes clean interface copy", () => {
    const dir = makeDir("ui.tsx", "<span>Books</span>");
    const result = runScript(emojiScript, dir);
    expect(result.status).toBe(0);
  });

  it("passes the real src tree (the wired lint target)", () => {
    const result = runScript(emojiScript, join(repoRoot, "src"));
    expect(result.status, result.stderr).toBe(0);
  });
});
