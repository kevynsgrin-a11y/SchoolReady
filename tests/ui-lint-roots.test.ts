/**
 * Phase 7 lint-root extension (Phase 0 handoff §4 standing requirement):
 * the banned-claims and no-emoji lints must scan EVERY copy directory —
 * now src AND public — and the wired npm script must say so.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const bannedScript = join(repoRoot, "scripts", "lint-banned-claims.mjs");
const emojiScript = join(repoRoot, "scripts", "lint-no-emoji.mjs");

describe("lint roots — extended to all UI copy directories", () => {
  it("package.json wires BOTH lints over src AND public explicitly", () => {
    const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts.lint).toContain("lint-banned-claims.mjs src public");
    expect(pkg.scripts.lint).toContain("lint-no-emoji.mjs src public");
  });

  it("banned-claims lint passes the real public tree", () => {
    const result = spawnSync("node", [bannedScript, join(repoRoot, "public")], { encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
  });

  it("no-emoji lint passes the real public tree", () => {
    const result = spawnSync("node", [emojiScript, join(repoRoot, "public")], { encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
  });

  it("both lints pass the src tree including the new src/ui copy", () => {
    for (const script of [bannedScript, emojiScript]) {
      const result = spawnSync("node", [script, join(repoRoot, "src")], { encoding: "utf8" });
      expect(result.status, result.stderr).toBe(0);
    }
  });
});
