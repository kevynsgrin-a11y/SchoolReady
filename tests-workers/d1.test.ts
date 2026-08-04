/**
 * D1 (workerd) integration tests. The node-side suite (tests/schema.test.ts)
 * proves reversibility and the full constraint battery on node:sqlite; this
 * suite proves the same migrations apply on the REAL D1 engine and that the
 * §1.4 provenance rules hold there too.
 */
import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

const INFRA_TABLE_PATTERNS = [/^d1_migrations$/, /^_cf_/, /^sqlite_/];

async function applicationTables(): Promise<string[]> {
  const { results } = await env.DB.prepare(
    `SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`,
  ).all<{ name: string }>();
  return results
    .map((r) => r.name)
    .filter((n) => !INFRA_TABLE_PATTERNS.some((p) => p.test(n)));
}

describe("D1 migrations on the real engine", () => {
  it("applies all wrangler-format up migrations", async () => {
    const tables = await applicationTables();
    expect(tables.length).toBeGreaterThanOrEqual(11);
    expect(tables).toContain("provenance");
    expect(tables).toContain("requirements");
  });

  it("every user-facing table carries a NOT NULL provenance FK (discovered, not hardcoded)", async () => {
    const tables = (await applicationTables()).filter((t) => t !== "provenance");
    expect(tables.length).toBeGreaterThanOrEqual(10);
    for (const table of tables) {
      const { results: cols } = await env.DB.prepare(
        `SELECT name, "notnull" AS not_null FROM pragma_table_info(?)`,
      )
        .bind(table)
        .all<{ name: string; not_null: number }>();
      const prov = cols.find((c) => c.name === "provenance_id");
      expect(prov, `${table}: missing provenance_id (§1.4)`).toBeDefined();
      expect(prov!.not_null, `${table}.provenance_id must be NOT NULL`).toBe(1);
      const { results: fks } = await env.DB.prepare(
        `SELECT "table" AS target, "from" AS source_col, "to" AS target_col
         FROM pragma_foreign_key_list(?)`,
      )
        .bind(table)
        .all<{ target: string; source_col: string; target_col: string }>();
      const fk = fks.find((f) => f.source_col === "provenance_id");
      expect(fk?.target, `${table}: provenance_id FK must reference provenance`).toBe(
        "provenance",
      );
    }
  });

  it("rejects a fact whose provenance row does not exist (§1.4 at the storage layer)", async () => {
    await expect(
      env.DB.prepare(
        `INSERT INTO schools (id, name, state, grade_low, grade_high, provenance_id)
         VALUES ('s1', 'Fixture Elementary', 'TX', 'K', '5', 'does-not-exist')`,
      ).run(),
    ).rejects.toThrow(/FOREIGN KEY/i);
  });

  it("accepts a fact once its provenance row exists", async () => {
    await env.DB.prepare(
      `INSERT INTO provenance (id, source, source_type, observed_at, retrieved_at, confidence)
       VALUES ('p1', 'fixture:d1-test', 'fixture', '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z', 1.0)`,
    ).run();
    await env.DB.prepare(
      `INSERT INTO schools (id, name, state, grade_low, grade_high, provenance_id)
       VALUES ('s1', 'Fixture Elementary', 'TX', 'K', '5', 'p1')`,
    ).run();
    const row = await env.DB.prepare(`SELECT is_synthetic FROM schools WHERE id = 's1'`).first<{
      is_synthetic: number;
    }>();
    expect(row?.is_synthetic).toBe(1);
  });
});
