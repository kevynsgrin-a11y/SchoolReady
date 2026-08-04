/**
 * Phase 1 schema tests.
 *
 * Proves, against the ACTUAL schema created by migrations/ (never a
 * hardcoded table list):
 *  - migrations run up AND down cleanly, and up-down-up is byte-identical;
 *  - every user-facing table carries a NOT NULL provenance FK (§1.4), and
 *    the provenance table carries all ten §1.4 fields;
 *  - no PII columns exist anywhere (§1.7);
 *  - no commission/affiliate-economics columns exist anywhere (§1.1);
 *  - storage-level constraints reject facts without provenance and
 *    contract-violating requirement rows;
 *  - the SQL CHECK vocabularies and src/contracts vocabularies never drift.
 */
import { describe, expect, it } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import {
  applicationTables,
  applyAllDown,
  applyAllUp,
  listDownFiles,
  listUpFiles,
  loadMigrations,
  openDb,
  schemaDump,
  tableColumns,
  tableForeignKeys,
} from "./helpers/migrations";
import {
  BRAND_REQUIREMENTS,
  CORRECTION_STATUSES,
  DURABILITIES,
  ENTITLEMENT_KINDS,
  ENTITLEMENT_STATUSES,
  ER_EDGE_STATUSES,
  ER_METHODS,
  ER_RELATIONS,
  FRESHNESS_LEVELS,
  GRADE_LEVELS,
  IDENTIFIER_TYPES,
  INTAKE_METHODS,
  ITEM_CONDITIONS,
  LIST_STATUSES,
  OPTIONALITIES,
  PRODUCT_CATEGORIES,
  REQUIREMENT_SOURCE_KINDS,
  RESOLUTION_STATUSES,
  RULING_STYLES,
  SCOPE_TYPES,
  SOURCE_TYPES,
  SUBJECTS,
  UNITS,
  VERIFICATION_STATUSES,
} from "../src/contracts";

function newMigratedDb(): DatabaseSync {
  const db = openDb();
  applyAllUp(db);
  return db;
}

function insertProvenance(db: DatabaseSync, id: string): void {
  db.prepare(
    `INSERT INTO provenance (id, source, source_type, observed_at, retrieved_at, confidence)
     VALUES (?, 'fixture:schema-test', 'fixture', '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z', 1.0)`,
  ).run(id);
}

/** Seed the minimal fixture graph most constraint tests hang off. */
function seedBase(db: DatabaseSync): void {
  insertProvenance(db, "p1");
  db.prepare(
    `INSERT INTO product_types (id, slug, name, category, default_durability, provenance_id)
     VALUES ('pt1', 'glue-stick', 'Glue stick', 'art', 'consumable', 'p1')`,
  ).run();
  db.prepare(
    `INSERT INTO supply_lists (id, school_year, intake_method, provenance_id)
     VALUES ('l1', '2026-2027', 'manual', 'p1')`,
  ).run();
}

describe("migrations — reversibility (§ mandate: up AND down cleanly)", () => {
  it("pairs every up migration with a same-named down migration", () => {
    const ups = listUpFiles();
    expect(ups.length).toBeGreaterThan(0);
    expect(listDownFiles()).toEqual(ups);
  });

  it("applies all up migrations cleanly on an empty database", () => {
    const db = newMigratedDb();
    expect(applicationTables(db).length).toBeGreaterThanOrEqual(10);
    db.close();
  });

  it("rolls all the way down to a zero-table database", () => {
    const db = newMigratedDb();
    applyAllDown(db);
    expect(applicationTables(db)).toEqual([]);
    expect(schemaDump(db)).toBe("[]");
    db.close();
  });

  it("up-down-up reproduces a byte-identical schema", () => {
    const db = newMigratedDb();
    const first = schemaDump(db);
    applyAllDown(db);
    applyAllUp(db);
    expect(schemaDump(db)).toBe(first);
    db.close();
  });

  it("supports stepwise rollback of only the latest migration", () => {
    const db = openDb();
    const migrations = loadMigrations();
    for (const m of migrations) db.exec(m.up);
    const last = migrations[migrations.length - 1];
    expect(last).toBeDefined();
    db.exec(last!.down);
    db.exec(last!.up);
    expect(schemaDump(db)).toBe(schemaDump(newMigratedDb()));
    db.close();
  });
});

describe("provenance — §1.4 universal record", () => {
  it("carries all ten §1.4 fields as columns", () => {
    const db = newMigratedDb();
    const cols = tableColumns(db, "provenance").map((c) => c.name);
    expect(cols).toEqual([
      "id",
      "source", // 1
      "source_type", // 2
      "observed_at", // 3 observation/effective date
      "retrieved_at", // 4 retrieval timestamp
      "geography", // 5
      "transform_version", // 6 transform/model version
      "freshness", // 7
      "confidence", // 8
      "limitations", // 9
      "correction_status", // 10
      "created_at",
    ]);
    db.close();
  });

  it("every user-facing table carries a NOT NULL provenance FK (discovered from live schema)", () => {
    const db = newMigratedDb();
    const tables = applicationTables(db).filter((t) => t !== "provenance");
    // Sanity: the discovery mechanism actually found the schema.
    expect(tables.length).toBeGreaterThanOrEqual(10);
    for (const table of tables) {
      const col = tableColumns(db, table).find((c) => c.name === "provenance_id");
      expect(col, `${table}: missing provenance_id column (§1.4)`).toBeDefined();
      expect(col!.notnull, `${table}.provenance_id must be NOT NULL (§1.4)`).toBe(1);
      const fk = tableForeignKeys(db, table).find((f) => f.from === "provenance_id");
      expect(fk, `${table}: provenance_id has no FK (§1.4)`).toBeDefined();
      expect(fk!.table, `${table}: provenance_id must reference provenance`).toBe("provenance");
      expect(fk!.to).toBe("id");
    }
    db.close();
  });

  it("rejects a fact whose provenance row does not exist (FK enforced)", () => {
    const db = newMigratedDb();
    expect(() =>
      db.prepare(
        `INSERT INTO schools (id, name, state, grade_low, grade_high, provenance_id)
         VALUES ('s1', 'Fixture Elementary', 'TX', 'K', '5', 'does-not-exist')`,
      ).run(),
    ).toThrow(/FOREIGN KEY/i);
    insertProvenance(db, "p1");
    db.prepare(
      `INSERT INTO schools (id, name, state, grade_low, grade_high, provenance_id)
       VALUES ('s1', 'Fixture Elementary', 'TX', 'K', '5', 'p1')`,
    ).run();
    db.close();
  });

  it("rejects out-of-range confidence and unknown vocabulary values", () => {
    const db = newMigratedDb();
    expect(() =>
      db.prepare(
        `INSERT INTO provenance (id, source, source_type, observed_at, retrieved_at, confidence)
         VALUES ('bad', 'fixture:x', 'fixture', '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z', 1.5)`,
      ).run(),
    ).toThrow(/CHECK/i);
    expect(() =>
      db.prepare(
        `INSERT INTO provenance (id, source, source_type, observed_at, retrieved_at, confidence)
         VALUES ('bad', 'fixture:x', 'rumor', '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z', 0.5)`,
      ).run(),
    ).toThrow(/CHECK/i);
    db.close();
  });
});

describe("PII — §1.7 (no PII columns anywhere)", () => {
  // Column- and table-name patterns for the §1.7 enumerated categories:
  // child names, teacher names, classroom IDs, addresses, exact sizes,
  // household budgets, gift recipients — plus direct identifiers.
  const PII_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
    [/child/i, "child reference (§1.7 child names)"],
    [/teacher/i, "teacher reference (§1.7 teacher names)"],
    [/classroom/i, "classroom identifier (§1.7)"],
    [/(first|last|full|middle|maiden|display|person|user|member|parent|guardian|student|kid)_?name/i, "person-name column (§1.7)"],
    [/address|street|zip|postal|latitude|longitude|geohash/i, "address / fine-grained location (§1.7)"],
    [/measurement|height|weight|waist|inseam|shoe_?size|clothing_?size/i, "body measurement (§1.7 exact sizes)"],
    [/budget|income|spend_limit/i, "household budget (§1.7)"],
    [/gift/i, "gift recipient (§1.7)"],
    [/email|phone|ssn|birth/i, "direct identifier (§1.7)"],
  ];

  it("no table or column name matches a PII pattern", () => {
    const db = newMigratedDb();
    const offenders: string[] = [];
    for (const table of applicationTables(db)) {
      for (const [re, label] of PII_PATTERNS) {
        if (re.test(table)) offenders.push(`table ${table}: ${label}`);
        for (const col of tableColumns(db, table)) {
          if (re.test(col.name)) offenders.push(`${table}.${col.name}: ${label}`);
        }
      }
    }
    expect(offenders).toEqual([]);
    db.close();
  });

  it("household-linked tables carry no size or free-text label columns", () => {
    const db = newMigratedDb();
    const offenders: string[] = [];
    for (const table of applicationTables(db).filter((t) => /household|entitlement/.test(t))) {
      for (const col of tableColumns(db, table)) {
        if (/(^|_)(size|label|title|note|notes|nickname)$/i.test(col.name)) {
          offenders.push(`${table}.${col.name}`);
        }
      }
    }
    expect(offenders).toEqual([]);
    db.close();
  });
});

describe("ranking neutrality — §1.1 (no economics columns)", () => {
  it("no table or column name matches a commission/affiliate-economics pattern", () => {
    const db = newMigratedDb();
    const ECON_RE =
      /commission|affiliate|payout|referral|rev_?share|kickback|take_?rate|epc|cpa|cpc|sponsored/i;
    const offenders: string[] = [];
    for (const table of applicationTables(db)) {
      if (ECON_RE.test(table)) offenders.push(`table ${table}`);
      for (const col of tableColumns(db, table)) {
        if (ECON_RE.test(col.name)) offenders.push(`${table}.${col.name}`);
      }
    }
    expect(offenders).toEqual([]);
    db.close();
  });
});

describe("requirements — contractual constraints", () => {
  const baseInsert = (extra: string, extraCols: string) =>
    `INSERT INTO requirements (id, list_id, product_type_id, quantity, durability, source_kind, source_confidence, provenance_id${extraCols})
     VALUES ('r-test', 'l1', 'pt1', 2, 'consumable', 'fixture', 0.9, 'p1'${extra})`;

  it("accepts a fully-specified valid requirement", () => {
    const db = newMigratedDb();
    seedBase(db);
    db.prepare(
      `INSERT INTO requirements (
         id, list_id, product_type_id, quantity, unit, pack_count, dimensions,
         material, color, ruling_style, brand_requirement, scope_type,
         scope_grade, durability, optionality, prohibited_substitutions,
         source_kind, source_confidence, provenance_id
       ) VALUES (
         'r1', 'l1', 'pt1', 2, 'pack', 12, '9x12 in',
         'paper', 'blue', 'wide_ruled', 'generic_allowed', 'grade',
         '3', 'consumable', 'required', '["no_character_prints"]',
         'fixture', 0.95, 'p1'
       )`,
    ).run();
    db.close();
  });

  it("rejects brand_requirement='required' without a required_brand_id", () => {
    const db = newMigratedDb();
    seedBase(db);
    expect(() =>
      db.prepare(baseInsert(", 'required'", ", brand_requirement")).run(),
    ).toThrow(/CHECK/i);
    db.close();
  });

  it("rejects teacher/classroom scope without an anonymous slot ordinal", () => {
    const db = newMigratedDb();
    seedBase(db);
    expect(() =>
      db.prepare(baseInsert(", 'teacher'", ", scope_type")).run(),
    ).toThrow(/CHECK/i);
    db.close();
  });

  it("rejects out-of-range source_confidence and non-positive quantity", () => {
    const db = newMigratedDb();
    seedBase(db);
    expect(() =>
      db.prepare(
        `INSERT INTO requirements (id, list_id, product_type_id, quantity, durability, source_kind, source_confidence, provenance_id)
         VALUES ('r-bad', 'l1', 'pt1', 2, 'consumable', 'fixture', 1.5, 'p1')`,
      ).run(),
    ).toThrow(/CHECK/i);
    expect(() =>
      db.prepare(
        `INSERT INTO requirements (id, list_id, product_type_id, quantity, durability, source_kind, source_confidence, provenance_id)
         VALUES ('r-bad', 'l1', 'pt1', 0, 'consumable', 'fixture', 0.9, 'p1')`,
      ).run(),
    ).toThrow(/CHECK/i);
    db.close();
  });

  it("rejects a malformed school_year on supply_lists", () => {
    const db = newMigratedDb();
    insertProvenance(db, "p1");
    expect(() =>
      db.prepare(
        `INSERT INTO supply_lists (id, school_year, intake_method, provenance_id)
         VALUES ('l-bad', 'twenty26', 'manual', 'p1')`,
      ).run(),
    ).toThrow(/CHECK/i);
    db.close();
  });
});

describe("identity graph — identifier scoping and uniqueness", () => {
  function seedCatalog(db: DatabaseSync): void {
    seedBase(db);
    db.prepare(
      `INSERT INTO brands (id, name, normalized_name, provenance_id)
       VALUES ('b1', 'Fixture Brand', 'fixture brand', 'p1')`,
    ).run();
    db.prepare(
      `INSERT INTO products (id, product_type_id, brand_id, name, provenance_id)
       VALUES ('pr1', 'pt1', 'b1', 'Fixture Glue Stick', 'p1')`,
    ).run();
    db.prepare(
      `INSERT INTO product_variants (id, product_id, provenance_id)
       VALUES ('v1', 'pr1', 'p1')`,
    ).run();
    db.prepare(
      `INSERT INTO retailers (id, slug, name, provenance_id)
       VALUES ('rt1', 'fixture-mart', 'Fixture Mart', 'p1')`,
    ).run();
  }

  it("global identifiers must not carry a retailer; retailer SKUs must", () => {
    const db = newMigratedDb();
    seedCatalog(db);
    expect(() =>
      db.prepare(
        `INSERT INTO product_identifiers (id, variant_id, id_type, id_value, retailer_id, provenance_id)
         VALUES ('i-bad', 'v1', 'upc_a', '012345678905', 'rt1', 'p1')`,
      ).run(),
    ).toThrow(/CHECK/i);
    expect(() =>
      db.prepare(
        `INSERT INTO product_identifiers (id, variant_id, id_type, id_value, provenance_id)
         VALUES ('i-bad', 'v1', 'retailer_sku', 'SKU-1', 'p1')`,
      ).run(),
    ).toThrow(/CHECK/i);
    db.prepare(
      `INSERT INTO product_identifiers (id, variant_id, id_type, id_value, provenance_id)
       VALUES ('i1', 'v1', 'upc_a', '012345678905', 'p1')`,
    ).run();
    db.prepare(
      `INSERT INTO product_identifiers (id, variant_id, id_type, id_value, retailer_id, provenance_id)
       VALUES ('i2', 'v1', 'retailer_sku', 'SKU-1', 'rt1', 'p1')`,
    ).run();
    db.close();
  });

  it("duplicate global identifiers are rejected (partial unique index)", () => {
    const db = newMigratedDb();
    seedCatalog(db);
    db.prepare(
      `INSERT INTO product_identifiers (id, variant_id, id_type, id_value, provenance_id)
       VALUES ('i1', 'v1', 'upc_a', '012345678905', 'p1')`,
    ).run();
    expect(() =>
      db.prepare(
        `INSERT INTO product_identifiers (id, variant_id, id_type, id_value, provenance_id)
         VALUES ('i-dup', 'v1', 'upc_a', '012345678905', 'p1')`,
      ).run(),
    ).toThrow(/UNIQUE/i);
    db.close();
  });

  it("entity-resolution edges reject self-edges and out-of-range scores", () => {
    const db = newMigratedDb();
    seedCatalog(db);
    expect(() =>
      db.prepare(
        `INSERT INTO entity_resolution_edges (id, variant_a_id, variant_b_id, relation, method, score, provenance_id)
         VALUES ('e-bad', 'v1', 'v1', 'same_item', 'exact_identifier', 1.0, 'p1')`,
      ).run(),
    ).toThrow(/CHECK/i);
    db.close();
  });
});

describe("vocabulary mirror — SQL CHECK lists match src/contracts", () => {
  const migrations = loadMigrations();
  const allSql = migrations.map((m) => m.up).join("\n");
  const byName = new Map(migrations.map((m) => [m.name, m.up]));

  function extractInLists(sql: string, column: string): string[][] {
    const re = new RegExp(String.raw`\b${column}\s+IN\s*\(([^)]*)\)`, "g");
    return [...sql.matchAll(re)].map((m) =>
      [...m[1]!.matchAll(/'([^']*)'/g)].map((x) => x[1]!),
    );
  }

  function expectVocab(
    sql: string,
    column: string,
    expected: readonly string[],
  ): void {
    const lists = extractInLists(sql, column);
    expect(lists.length, `no CHECK ... IN found for "${column}"`).toBeGreaterThan(0);
    for (const list of lists) {
      expect(list, `CHECK vocabulary drift on "${column}"`).toEqual([...expected]);
    }
  }

  it("provenance vocabularies match", () => {
    expectVocab(allSql, "source_type", SOURCE_TYPES);
    expectVocab(allSql, "freshness", FRESHNESS_LEVELS);
    expectVocab(allSql, "correction_status", CORRECTION_STATUSES);
  });

  it("requirement vocabularies match", () => {
    expectVocab(allSql, "brand_requirement", BRAND_REQUIREMENTS);
    expectVocab(allSql, "optionality", OPTIONALITIES);
    expectVocab(allSql, "scope_type", SCOPE_TYPES);
    expectVocab(allSql, "scope_subject", SUBJECTS);
    expectVocab(allSql, "scope_grade", GRADE_LEVELS);
    expectVocab(allSql, "source_kind", REQUIREMENT_SOURCE_KINDS);
    expectVocab(allSql, "intake_method", INTAKE_METHODS);
    expectVocab(allSql, "verification_status", VERIFICATION_STATUSES);
    expectVocab(allSql, "unit", UNITS);
    expectVocab(allSql, "default_unit", UNITS);
    expectVocab(allSql, "ruling_style", RULING_STYLES);
    expectVocab(allSql, "durability", DURABILITIES);
    expectVocab(allSql, "default_durability", DURABILITIES);
  });

  it("catalog and grade vocabularies match", () => {
    expectVocab(allSql, "category", PRODUCT_CATEGORIES);
    expectVocab(allSql, "id_type", IDENTIFIER_TYPES);
    expectVocab(allSql, "resolution_status", RESOLUTION_STATUSES);
    expectVocab(allSql, "relation", ER_RELATIONS);
    expectVocab(allSql, "method", ER_METHODS);
    expectVocab(allSql, "grade_low", GRADE_LEVELS);
    expectVocab(allSql, "grade_high", GRADE_LEVELS);
    expectVocab(allSql, "grade_level", GRADE_LEVELS);
    expectVocab(allSql, "condition", ITEM_CONDITIONS);
    expectVocab(allSql, "kind", ENTITLEMENT_KINDS);
  });

  it("per-table status vocabularies match", () => {
    expectVocab(byName.get("0002_catalog.sql")!, "status", ER_EDGE_STATUSES);
    expectVocab(byName.get("0003_schools_households.sql")!, "status", ENTITLEMENT_STATUSES);
    expectVocab(byName.get("0004_lists_requirements.sql")!, "status", LIST_STATUSES);
  });
});
