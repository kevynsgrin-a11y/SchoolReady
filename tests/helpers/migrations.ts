/**
 * Local up/down migration harness. Wrangler's D1 tooling has no native
 * down-migration support, so reversibility is proven here against an
 * in-memory SQLite database (node:sqlite, Node >= 22 — no native deps).
 * D1 is SQLite-backed, and `wrangler d1 migrations apply --local` runs the
 * same up files (migrations/*.sql); down files live in migrations/down/
 * (same filename), a subdirectory wrangler's up-runner does not read.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

export const migrationsDir = fileURLToPath(
  new URL("../../migrations", import.meta.url),
);
export const downDir = join(migrationsDir, "down");

const sqlFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".sql"))
    .map((e) => e.name)
    .sort();

export const listUpFiles = (): string[] => sqlFiles(migrationsDir);
export const listDownFiles = (): string[] => sqlFiles(downDir);

export interface MigrationPair {
  name: string;
  up: string;
  down: string;
}

/** Ordered migration pairs. Pairing completeness is asserted by a test. */
export function loadMigrations(): MigrationPair[] {
  return listUpFiles().map((name) => ({
    name,
    up: readFileSync(join(migrationsDir, name), "utf8"),
    down: readFileSync(join(downDir, name), "utf8"),
  }));
}

/** In-memory database with foreign-key enforcement ON (D1 enforces FKs too). */
export function openDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  return db;
}

export function applyAllUp(db: DatabaseSync): void {
  for (const m of loadMigrations()) db.exec(m.up);
}

export function applyAllDown(db: DatabaseSync): void {
  for (const m of [...loadMigrations()].reverse()) db.exec(m.down);
}

interface SchemaRow {
  type: string;
  name: string;
  tbl_name: string;
  sql: string | null;
}

/** Full user-schema dump (tables + indexes + their SQL), stable ordering. */
export function schemaDump(db: DatabaseSync): string {
  const rows = db
    .prepare(
      `SELECT type, name, tbl_name, sql FROM sqlite_master
       WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name`,
    )
    .all() as unknown as SchemaRow[];
  return JSON.stringify(rows, null, 2);
}

/**
 * Infrastructure bookkeeping tables that are not user-facing facts:
 * wrangler's migration ledger and D1's internal tables. Everything else in
 * sqlite_master is subject to the §1.4 provenance-FK rule.
 */
export const INFRA_TABLE_PATTERNS = [/^d1_migrations$/, /^_cf_/, /^sqlite_/];

/** All application tables discovered from the live schema (never hardcoded). */
export function applicationTables(db: DatabaseSync): string[] {
  const rows = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`)
    .all() as unknown as { name: string }[];
  return rows
    .map((r) => r.name)
    .filter((n) => !INFRA_TABLE_PATTERNS.some((p) => p.test(n)));
}

export interface ColumnInfo {
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}

export function tableColumns(db: DatabaseSync, table: string): ColumnInfo[] {
  return db
    .prepare(`SELECT * FROM pragma_table_info(?) ORDER BY cid`)
    .all(table) as unknown as ColumnInfo[];
}

export interface ForeignKeyInfo {
  table: string;
  from: string;
  to: string;
}

export function tableForeignKeys(
  db: DatabaseSync,
  table: string,
): ForeignKeyInfo[] {
  return db
    .prepare(`SELECT "table", "from", "to" FROM pragma_foreign_key_list(?)`)
    .all(table) as unknown as ForeignKeyInfo[];
}
