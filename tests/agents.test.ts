import { readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const agentsDir = join(fileURLToPath(new URL("..", import.meta.url)), ".claude", "agents");

const ROSTER = [
  "scope-guardian",
  "data-architect",
  "ingestion-engineer",
  "parser-engineer",
  "algorithm-engineer",
  "backend-api",
  "design-director",
  "frontend-engineer",
  "seo-architect",
  "monetization-engineer",
  "compliance-officer",
  "accessibility-qa",
  "release-qa",
];

const REQUIRED_FRONTMATTER = ["name", "description", "tools", "model"];
const REQUIRED_SECTIONS = [
  "## Mandate",
  "## Inputs",
  "## Outputs",
  "## Hard constraints",
  "## Acceptance criteria",
];

function parseFrontmatter(source: string) {
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(source);
  if (!match) return null;
  const data: Record<string, string> = {};
  for (const line of match[1]!.split("\n")) {
    const idx = line.indexOf(":");
    if (idx > 0) data[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return { data, body: match[2]! };
}

describe("sub-agent definitions load (§3.1)", () => {
  it("defines exactly the 13-agent roster", () => {
    const files = readdirSync(agentsDir).filter((f) => f.endsWith(".md"));
    const names = files.map((f) => basename(f, ".md")).sort();
    expect(names).toEqual([...ROSTER].sort());
  });

  for (const agent of ROSTER) {
    describe(agent, () => {
      const source = readFileSync(join(agentsDir, `${agent}.md`), "utf8");
      const parsed = parseFrontmatter(source);

      it("has parseable YAML frontmatter", () => {
        expect(parsed).not.toBeNull();
      });

      it("has all required frontmatter keys, non-empty", () => {
        for (const key of REQUIRED_FRONTMATTER) {
          expect(parsed!.data[key], `${agent}: missing frontmatter "${key}"`).toBeTruthy();
        }
      });

      it("frontmatter name matches filename", () => {
        expect(parsed!.data["name"]).toBe(agent);
      });

      it("body contains every required section", () => {
        for (const section of REQUIRED_SECTIONS) {
          expect(parsed!.body, `${agent}: missing "${section}"`).toContain(section);
        }
      });
    });
  }
});
