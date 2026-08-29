/**
 * D1 data access for the API (Phase 5).
 *
 * §1.4: every row written here carries a provenance_id whose full ten-field
 * record is inserted FIRST (the FK repeats the rule at storage level).
 * §1.7 / P3-2 / P5-1: requirement rows are built from CONTROLLED-VOCABULARY
 * draft fields only. No free text survives into any INSERT: originalText and
 * review-payload text have no path here, and every slug-shaped input this
 * module writes into a global table is independently re-checked against its
 * lexicon (ensureProductType, ensureBrand) so a future parsing change cannot
 * reopen a free-text channel. The workerd zero-PII cycle test drives this
 * module and scans every table row.
 */
import type { ProvenanceRecord, IsoTimestamp } from "../contracts/provenance";
import type { GradeLevel, StateCode } from "../contracts/school";
import type { IntakeMethod } from "../contracts/requirement";
import type { ItemCondition } from "../contracts/household";
import type { ParsedRequirementDraft } from "../parsing/types";
import { getBrandEntry, getLexiconEntry } from "../parsing/lexicon";
import { isoFromMs } from "../ingestion/types";
import type { Clock } from "../ingestion/types";
import type { D1Like } from "./deps";
import type { AlertKind, RequirementSummary, InventorySummary } from "./contracts";
import { validationFailed } from "./errors";

const now = (clock: Clock): IsoTimestamp => isoFromMs(clock());

/* ------------------------------------------------------------------ */
/* Provenance                                                          */
/* ------------------------------------------------------------------ */

export async function insertProvenance(
  db: D1Like,
  p: ProvenanceRecord,
): Promise<void> {
  await db
    .prepare(
      `INSERT OR IGNORE INTO provenance
         (id, source, source_type, observed_at, retrieved_at, geography,
          transform_version, freshness, confidence, limitations,
          correction_status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      p.id,
      p.source,
      p.sourceType,
      p.observedAt,
      p.retrievedAt,
      p.geography,
      p.transformVersion,
      p.freshness,
      p.confidence,
      p.limitations,
      p.correctionStatus,
      p.createdAt,
    )
    .run();
}

/** Full §1.4 record for a user-entered fact (anonymous; no PII fields). */
export function userProvenance(
  source: string,
  id: string,
  clock: Clock,
  limitations: string,
  sourceType: ProvenanceRecord["sourceType"] = "user_entry",
): ProvenanceRecord {
  const at = now(clock);
  return {
    id,
    source,
    sourceType,
    observedAt: at,
    retrievedAt: at,
    geography: "US",
    transformVersion: "api:worker@0.5.0",
    freshness: "fresh",
    confidence: 1,
    limitations,
    correctionStatus: "none",
    createdAt: at,
  };
}

interface ProvenanceDbRow {
  id: string;
  source: string;
  source_type: string;
  observed_at: string;
  retrieved_at: string;
  geography: string;
  transform_version: string;
  freshness: string;
  confidence: number;
  limitations: string;
  correction_status: string;
  created_at: string;
}

export async function getProvenanceRecords(
  db: D1Like,
  ids: readonly string[],
): Promise<Record<string, ProvenanceRecord>> {
  const out: Record<string, ProvenanceRecord> = {};
  const unique = [...new Set(ids)];
  if (unique.length === 0) return out;
  // D1 caps bound parameters per query (100). Every user-facing read funnels
  // through here with one provenance id per row, so an ordinary multi-child
  // household otherwise exceeds the cap and 500s permanently on every core
  // endpoint. purgeHousehold already chunks its deletes at 50; the read path
  // needs the same treatment.
  const CHUNK = 50;
  const rows: ProvenanceDbRow[] = [];
  for (let i = 0; i < unique.length; i += CHUNK) {
    const batch = unique.slice(i, i + CHUNK);
    const placeholders = batch.map(() => "?").join(", ");
    const { results } = await db
      .prepare(`SELECT * FROM provenance WHERE id IN (${placeholders})`)
      .bind(...batch)
      .all<ProvenanceDbRow>();
    rows.push(...results);
  }
  for (const r of rows) {
    out[r.id] = {
      id: r.id,
      source: r.source,
      sourceType: r.source_type as ProvenanceRecord["sourceType"],
      observedAt: r.observed_at,
      retrievedAt: r.retrieved_at,
      geography: r.geography,
      transformVersion: r.transform_version,
      freshness: r.freshness as ProvenanceRecord["freshness"],
      confidence: r.confidence,
      limitations: r.limitations,
      correctionStatus: r.correction_status as ProvenanceRecord["correctionStatus"],
      createdAt: r.created_at,
    };
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Taxonomy seeds (product types / brands from the parsing lexicon)    */
/* ------------------------------------------------------------------ */

/**
 * Resolves a canonical taxonomy slug to a product_types row id, seeding the
 * row from the parsing lexicon on first use (handoff 04: the lexicon carries
 * the taxonomy defaults a Phase 5 seeder needs). Unknown slugs are rejected
 * — never guessed into the taxonomy.
 */
export async function ensureProductType(
  db: D1Like,
  slug: string,
  clock: Clock,
): Promise<string> {
  const existing = await db
    .prepare(`SELECT id FROM product_types WHERE slug = ?`)
    .bind(slug)
    .first<{ id: string }>();
  if (existing) return existing.id;
  const lexicon = getLexiconEntry(slug);
  if (!lexicon) {
    throw validationFailed(`unknown product type slug (not in the taxonomy)`);
  }
  const provId = `prov:taxonomy:${slug}`;
  await insertProvenance(db, {
    ...userProvenance(
      "seed:product-taxonomy@lexicon",
      provId,
      clock,
      "Canonical taxonomy row seeded from the curated parsing lexicon (src/parsing/lexicon.ts).",
      "operator_curation",
    ),
  });
  const id = `pt:${slug}`;
  await db
    .prepare(
      `INSERT OR IGNORE INTO product_types
         (id, slug, name, category, default_unit, default_durability, provenance_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, slug, lexicon.displayName, lexicon.category, lexicon.defaultUnit, lexicon.durability, provId)
    .run();
  return id;
}

/**
 * Deterministic brand row for a LEXICON brand slug ('elmers' -> 'brand:elmers').
 * P5-1 defense in depth: refuses any slug outside BRAND_LEXICON before the
 * INSERT, independently of the parse-pipeline check — the global `brands`
 * table must never be reachable by client free text (§1.7). The refusal
 * message never echoes the offending value.
 */
export async function ensureBrand(
  db: D1Like,
  brandSlug: string,
  clock: Clock,
): Promise<string> {
  if (!getBrandEntry(brandSlug)) {
    throw validationFailed(
      "requiredBrandSlug must come from the controlled brand vocabulary",
    );
  }
  const id = `brand:${brandSlug}`;
  const existing = await db
    .prepare(`SELECT id FROM brands WHERE id = ?`)
    .bind(id)
    .first<{ id: string }>();
  if (existing) return id;
  const provId = `prov:brand:${brandSlug}`;
  await insertProvenance(db, {
    ...userProvenance(
      "seed:brand@requirement",
      provId,
      clock,
      "Brand row created from a user-confirmed brand requirement slug.",
      "operator_curation",
    ),
  });
  await db
    .prepare(
      `INSERT OR IGNORE INTO brands (id, name, normalized_name, provenance_id)
       VALUES (?, ?, ?, ?)`,
    )
    .bind(id, brandSlug, brandSlug, provId)
    .run();
  return id;
}

export const brandSlugFromId = (brandId: string | null): string | null =>
  brandId === null ? null : brandId.replace(/^brand:/, "");

/* ------------------------------------------------------------------ */
/* Households / members                                                */
/* ------------------------------------------------------------------ */

export async function createHousehold(
  db: D1Like,
  ids: () => string,
  clock: Clock,
  state: StateCode | null,
): Promise<string> {
  const id = `hh_${ids()}`;
  const provId = `prov:household:${id}`;
  await insertProvenance(
    db,
    userProvenance(
      "user:anonymous-session",
      provId,
      clock,
      "Anonymous-first household: opaque id plus optional coarse geography (state). No identity data exists (SS1.7).",
    ),
  );
  await db
    .prepare(`INSERT INTO households (id, state, provenance_id, created_at) VALUES (?, ?, ?, ?)`)
    .bind(id, state, provId, now(clock))
    .run();
  return id;
}

export async function setHouseholdState(
  db: D1Like,
  householdId: string,
  state: StateCode,
): Promise<void> {
  await db
    .prepare(`UPDATE households SET state = ? WHERE id = ?`)
    .bind(state, householdId)
    .run();
}

export async function getHouseholdState(
  db: D1Like,
  householdId: string,
): Promise<StateCode | null> {
  const row = await db
    .prepare(`SELECT state FROM households WHERE id = ?`)
    .bind(householdId)
    .first<{ state: string | null }>();
  return row?.state ?? null;
}

export async function ensureMember(
  db: D1Like,
  ids: () => string,
  clock: Clock,
  householdId: string,
  ordinal: number,
  gradeLevel: GradeLevel | null,
): Promise<string> {
  const existing = await db
    .prepare(`SELECT id FROM household_members WHERE household_id = ? AND ordinal = ?`)
    .bind(householdId, ordinal)
    .first<{ id: string }>();
  if (existing) return existing.id;
  const id = `hm_${ids()}`;
  const provId = `prov:member:${id}`;
  await insertProvenance(
    db,
    userProvenance(
      "user:anonymous-session",
      provId,
      clock,
      "Anonymous household member: ordinal ('Child N') and structural grade only — never a name (SS1.7).",
    ),
  );
  await db
    .prepare(
      `INSERT INTO household_members (id, household_id, ordinal, grade_level, provenance_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, householdId, ordinal, gradeLevel, provId, now(clock))
    .run();
  return id;
}

export async function listMemberOrdinals(
  db: D1Like,
  householdId: string,
): Promise<number[]> {
  const { results } = await db
    .prepare(
      `SELECT ordinal FROM household_members WHERE household_id = ? ORDER BY ordinal`,
    )
    .bind(householdId)
    .all<{ ordinal: number }>();
  return results.map((r) => r.ordinal);
}

/* ------------------------------------------------------------------ */
/* Lists + requirements (P3-2: controlled-vocabulary fields only)      */
/* ------------------------------------------------------------------ */

export interface PersistListArgs {
  householdId: string;
  memberId: string;
  intakeMethod: IntakeMethod;
  schoolYear: string;
  gradeLevel: GradeLevel | null;
  /** Validated drafts (from parseManualIntake over the confirm payload). */
  drafts: readonly { draft: ParsedRequirementDraft; sourceConfidence: number }[];
}

export interface PersistedList {
  listId: string;
  requirements: RequirementSummary[];
  provenanceIds: string[];
}

export async function persistConfirmedList(
  db: D1Like,
  ids: () => string,
  clock: Clock,
  args: PersistListArgs,
): Promise<PersistedList> {
  const listId = `list_${ids()}`;
  const listProvId = `prov:list:${listId}`;
  await insertProvenance(
    db,
    userProvenance(
      "user:confirmed-review",
      listProvId,
      clock,
      "Supply list confirmed by the user in the mandatory review step (SS1.5). Structured fields only; no raw list text persists (SS1.7).",
    ),
  );
  const at = now(clock);
  await db
    .prepare(
      `INSERT INTO supply_lists
         (id, household_id, school_year, grade_level, intake_method,
          verification_status, status, provenance_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'user_confirmed', 'active', ?, ?, ?)`,
    )
    .bind(listId, args.householdId, args.schoolYear, args.gradeLevel, args.intakeMethod, listProvId, at, at)
    .run();
  const assignmentId = `la_${ids()}`;
  await db
    .prepare(
      `INSERT INTO list_assignments (id, list_id, household_member_id, provenance_id, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(assignmentId, listId, args.memberId, listProvId, at)
    .run();

  const requirements: RequirementSummary[] = [];
  const provenanceIds: string[] = [listProvId];
  for (const { draft, sourceConfidence } of args.drafts) {
    if (draft.productTypeSlug === null || draft.durability === null) {
      // §1.5: unresolved items cannot be confirmed; the review UI resolves
      // them first. Reaching here is a caller bug, not user error.
      throw validationFailed("unresolved item cannot be confirmed");
    }
    const productTypeId = await ensureProductType(db, draft.productTypeSlug, clock);
    const brandId =
      draft.requiredBrandSlug === null
        ? null
        : await ensureBrand(db, draft.requiredBrandSlug, clock);
    const reqId = `req_${ids()}`;
    const provId = `prov:req:${reqId}`;
    await insertProvenance(
      db,
      userProvenance(
        "user:confirmed-review",
        provId,
        clock,
        "Requirement built from controlled-vocabulary draft fields the user confirmed; prohibited substitutions pass sanitizeProhibitedSubstitutions. No review-payload text was persisted (SS1.7).",
      ),
    );
    await db
      .prepare(
        `INSERT INTO requirements
           (id, list_id, product_type_id, quantity, unit, pack_count,
            dimensions, material, color, ruling_style, brand_requirement,
            required_brand_id, scope_type, scope_grade, scope_subject,
            scope_slot, durability, optionality, prohibited_substitutions,
            source_kind, source_confidence, provenance_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'list', NULL, NULL, NULL,
                 ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        reqId,
        listId,
        productTypeId,
        draft.quantity,
        draft.unit,
        draft.packCount,
        draft.dimensions,
        draft.material,
        draft.color,
        draft.rulingStyle,
        draft.brandRequirement,
        brandId,
        draft.durability,
        draft.optionality,
        JSON.stringify(draft.prohibitedSubstitutions),
        args.intakeMethod,
        sourceConfidence,
        provId,
        at,
        at,
      )
      .run();
    provenanceIds.push(provId);
    requirements.push({
      id: reqId,
      listId,
      productTypeSlug: draft.productTypeSlug,
      quantity: draft.quantity,
      unit: draft.unit,
      packCount: draft.packCount,
      dimensions: draft.dimensions,
      material: draft.material,
      color: draft.color,
      rulingStyle: draft.rulingStyle,
      brandRequirement: draft.brandRequirement,
      requiredBrandSlug: draft.requiredBrandSlug,
      optionality: draft.optionality,
      prohibitedSubstitutions: draft.prohibitedSubstitutions,
      sourceKind: args.intakeMethod,
      sourceConfidence,
      provenanceIds: [provId],
    });
  }
  return { listId, requirements, provenanceIds };
}

export interface RequirementJoinRow {
  id: string;
  list_id: string;
  product_type_slug: string;
  quantity: number;
  unit: string;
  pack_count: number | null;
  dimensions: string | null;
  material: string | null;
  color: string | null;
  ruling_style: string | null;
  brand_requirement: string;
  required_brand_id: string | null;
  optionality: string;
  prohibited_substitutions: string | null;
  source_kind: string;
  source_confidence: number;
  provenance_id: string;
  verification_status: string;
  grade_level: string | null;
  school_year: string;
  intake_method: string;
  ordinal: number;
}

/** Every requirement on the household's active lists, joined to child ordinals. */
export async function listHouseholdRequirements(
  db: D1Like,
  householdId: string,
): Promise<RequirementJoinRow[]> {
  const { results } = await db
    .prepare(
      `SELECT r.id, r.list_id, pt.slug AS product_type_slug, r.quantity, r.unit,
              r.pack_count, r.dimensions, r.material, r.color, r.ruling_style,
              r.brand_requirement, r.required_brand_id, r.optionality,
              r.prohibited_substitutions, r.source_kind, r.source_confidence,
              r.provenance_id, sl.verification_status, sl.grade_level,
              sl.school_year, sl.intake_method, hm.ordinal
       FROM requirements r
       JOIN supply_lists sl ON sl.id = r.list_id
       JOIN product_types pt ON pt.id = r.product_type_id
       JOIN list_assignments la ON la.list_id = sl.id
       JOIN household_members hm ON hm.id = la.household_member_id
       WHERE sl.household_id = ? AND sl.status = 'active'
       ORDER BY r.id`,
    )
    .bind(householdId)
    .all<RequirementJoinRow>();
  return results;
}

/* ------------------------------------------------------------------ */
/* Inventory                                                           */
/* ------------------------------------------------------------------ */

export async function insertInventoryItem(
  db: D1Like,
  ids: () => string,
  clock: Clock,
  householdId: string,
  item: { productTypeSlug: string; quantity: number; condition: ItemCondition },
): Promise<InventorySummary> {
  const productTypeId = await ensureProductType(db, item.productTypeSlug, clock);
  const id = `inv_${ids()}`;
  const provId = `prov:inventory:${id}`;
  await insertProvenance(
    db,
    userProvenance(
      "user:inventory-audit",
      provId,
      clock,
      "Household inventory audit entry (SS0 capability 2): product type, count, condition — nothing else.",
    ),
  );
  const at = now(clock);
  await db
    .prepare(
      `INSERT INTO inventory_items
         (id, household_id, product_type_id, quantity, condition, provenance_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, householdId, productTypeId, item.quantity, item.condition, provId, at, at)
    .run();
  return {
    id,
    productTypeSlug: item.productTypeSlug,
    quantity: item.quantity,
    condition: item.condition,
    provenanceIds: [provId],
  };
}

export interface InventoryJoinRow {
  id: string;
  product_type_slug: string;
  quantity: number;
  condition: ItemCondition;
  provenance_id: string;
}

export async function listInventory(
  db: D1Like,
  householdId: string,
): Promise<InventoryJoinRow[]> {
  const { results } = await db
    .prepare(
      `SELECT i.id, pt.slug AS product_type_slug, i.quantity, i.condition, i.provenance_id
       FROM inventory_items i
       JOIN product_types pt ON pt.id = i.product_type_id
       WHERE i.household_id = ?
       ORDER BY i.id`,
    )
    .bind(householdId)
    .all<InventoryJoinRow>();
  return results;
}

/* ------------------------------------------------------------------ */
/* Alerts                                                              */
/* ------------------------------------------------------------------ */

export async function insertAlertSubscription(
  db: D1Like,
  ids: () => string,
  clock: Clock,
  householdId: string,
  alertKind: AlertKind,
  productTypeSlug: string | null,
  listId: string | null,
): Promise<{ id: string; provenanceId: string }> {
  const productTypeId =
    productTypeSlug === null ? null : await ensureProductType(db, productTypeSlug, clock);
  const id = `alrt_${ids()}`;
  const provId = `prov:alert:${id}`;
  await insertProvenance(
    db,
    userProvenance(
      "user:alert-subscription",
      provId,
      clock,
      "Anonymous in-app alert subscription. No delivery channel is stored (SS1.7: no contact data).",
    ),
  );
  await db
    .prepare(
      `INSERT INTO alert_subscriptions
         (id, household_id, alert_kind, product_type_id, list_id, provenance_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, householdId, alertKind, productTypeId, listId, provId, now(clock))
    .run();
  return { id, provenanceId: provId };
}

export interface AlertJoinRow {
  id: string;
  alert_kind: AlertKind;
  product_type_slug: string | null;
  list_id: string | null;
  provenance_id: string;
}

export async function listAlertSubscriptions(
  db: D1Like,
  householdId: string,
): Promise<AlertJoinRow[]> {
  const { results } = await db
    .prepare(
      `SELECT a.id, a.alert_kind, pt.slug AS product_type_slug, a.list_id, a.provenance_id
       FROM alert_subscriptions a
       LEFT JOIN product_types pt ON pt.id = a.product_type_id
       WHERE a.household_id = ?
       ORDER BY a.id`,
    )
    .bind(householdId)
    .all<AlertJoinRow>();
  return results;
}

/* ------------------------------------------------------------------ */
/* Entitlements                                                        */
/* ------------------------------------------------------------------ */

export interface EntitlementRow {
  id: string;
  kind: string;
  status: string;
  valid_from: string;
  valid_until: string;
  provenance_id: string;
}

export async function activeEntitlement(
  db: D1Like,
  householdId: string,
  nowIso: IsoTimestamp,
): Promise<EntitlementRow | null> {
  return db
    .prepare(
      `SELECT id, kind, status, valid_from, valid_until, provenance_id
       FROM entitlements
       WHERE household_id = ? AND status = 'active'
         AND valid_from <= ? AND valid_until >= ?
       ORDER BY created_at DESC LIMIT 1`,
    )
    .bind(householdId, nowIso, nowIso)
    .first<EntitlementRow>();
}

export async function insertEntitlement(
  db: D1Like,
  ids: () => string,
  clock: Clock,
  householdId: string,
  validFrom: IsoTimestamp,
  validUntil: IsoTimestamp,
  paymentRef: string,
): Promise<string> {
  const id = `ent_${ids()}`;
  const provId = `prov:entitlement:${id}`;
  await insertProvenance(
    db,
    userProvenance(
      "fixture:season-pass-webhook",
      provId,
      clock,
      "Season Pass entitlement recorded from a fixture-verified webhook event (validation beta; no live payment processing exists). Gates ad-free extras ONLY (SS1.2).",
      "fixture",
    ),
  );
  await db
    .prepare(
      `INSERT INTO entitlements
         (id, household_id, kind, status, valid_from, valid_until,
          external_payment_ref, provenance_id, created_at)
       VALUES (?, ?, 'season_pass', 'active', ?, ?, ?, ?, ?)`,
    )
    .bind(id, householdId, validFrom, validUntil, paymentRef, provId, now(clock))
    .run();
  return id;
}

export async function refundEntitlementByPaymentRef(
  db: D1Like,
  paymentRef: string,
): Promise<void> {
  await db
    .prepare(
      `UPDATE entitlements SET status = 'refunded' WHERE external_payment_ref = ?`,
    )
    .bind(paymentRef)
    .run();
}

/* ------------------------------------------------------------------ */
/* Data rights (Phase 10): export + one-pass deletion                  */
/* ------------------------------------------------------------------ */

export interface MemberRow {
  ordinal: number;
  grade_level: GradeLevel | null;
  provenance_id: string;
}

/** Ordinal-only members with grade (§1.7: there is no name column to read). */
export async function listMembers(
  db: D1Like,
  householdId: string,
): Promise<MemberRow[]> {
  const { results } = await db
    .prepare(
      `SELECT ordinal, grade_level, provenance_id
       FROM household_members WHERE household_id = ? ORDER BY ordinal`,
    )
    .bind(householdId)
    .all<MemberRow>();
  return results;
}

/** Every entitlement row for the household (export shows refunds too). */
export async function listEntitlements(
  db: D1Like,
  householdId: string,
): Promise<EntitlementRow[]> {
  const { results } = await db
    .prepare(
      `SELECT id, kind, status, valid_from, valid_until, provenance_id
       FROM entitlements WHERE household_id = ? ORDER BY created_at`,
    )
    .bind(householdId)
    .all<EntitlementRow>();
  return results;
}

/**
 * Every table holding session-linked user rows, as (table, WHERE clause on
 * ?1 = householdId) pairs in FK-SAFE DELETION ORDER (children first). The
 * one-pass purge below both counts and deletes through this single list, so
 * a future user-data table must be added here — the workers deletion test
 * walks sqlite_master and fails if a household-linked row survives a purge.
 */
const HOUSEHOLD_DATA_TABLES: readonly { table: string; where: string }[] = [
  { table: "requirements", where: "list_id IN (SELECT id FROM supply_lists WHERE household_id = ?1)" },
  { table: "list_assignments", where: "list_id IN (SELECT id FROM supply_lists WHERE household_id = ?1)" },
  { table: "alert_subscriptions", where: "household_id = ?1" },
  { table: "supply_lists", where: "household_id = ?1" },
  { table: "inventory_items", where: "household_id = ?1" },
  { table: "entitlements", where: "household_id = ?1" },
  { table: "household_members", where: "household_id = ?1" },
  { table: "api_sessions", where: "household_id = ?1" },
  { table: "households", where: "id = ?1" },
];

/**
 * §1.7 one-pass deletion: removes EVERY row linked to the household — data
 * rows AND their per-user provenance records — in a single call. Global
 * taxonomy rows (product_types, brands and their seed provenance) are shared
 * vocabulary, not user data, and survive. Returns the exact number of rows
 * removed, counted from the database before deletion (never estimated).
 */
export async function purgeHousehold(
  db: D1Like,
  householdId: string,
): Promise<number> {
  // 1. Collect the per-user provenance ids BEFORE the rows citing them go.
  const provenanceIds = new Set<string>();
  for (const { table, where } of HOUSEHOLD_DATA_TABLES) {
    const { results } = await db
      .prepare(`SELECT provenance_id FROM ${table} WHERE ${where}`)
      .bind(householdId)
      .all<{ provenance_id: string }>();
    for (const row of results) provenanceIds.add(row.provenance_id);
  }

  // 2. Count, then delete, children-first (FKs stay satisfied throughout).
  let rowsDeleted = 0;
  for (const { table, where } of HOUSEHOLD_DATA_TABLES) {
    const count = await db
      .prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`)
      .bind(householdId)
      .first<{ n: number }>();
    rowsDeleted += count?.n ?? 0;
    await db.prepare(`DELETE FROM ${table} WHERE ${where}`).bind(householdId).run();
  }

  // 3. Delete the now-unreferenced per-user provenance records (chunked).
  const ids = [...provenanceIds];
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const placeholders = chunk.map(() => "?").join(", ");
    await db
      .prepare(`DELETE FROM provenance WHERE id IN (${placeholders})`)
      .bind(...chunk)
      .run();
  }
  rowsDeleted += ids.length;
  return rowsDeleted;
}
