/**
 * Endpoint handlers + the shipped route table (Phase 5).
 *
 * Anonymous-first: NOTHING here knows what an account is. Every route works
 * with (at most) the opaque anonymous session cookie; required-list data,
 * safety warnings, and deadlines are category-protected so they can never be
 * entitlement-gated (assertRoutePolicies + tests/api-policy.test.ts).
 */
import {
  GARMENT_CATEGORIES,
  CLIMATE_BANDS,
  computeCapsuleCategory,
  buyNowVsWait,
} from "../algorithms/capsule";
import type { CapsuleCategoryInput } from "../algorithms/capsule";
import { evaluateFamily, classifyTrend, median, SIGNAL_FAMILIES } from "../algorithms/trend";
import type { FamilySeriesInput, SignalFamily } from "../algorithms/trend";
import {
  combineFindings,
  evaluateDeadlineFeasibility,
  evaluateRecallStatus,
  evaluateTrendClaim,
} from "../algorithms/suppression";
import type { RecallProductRef } from "../algorithms/suppression";
import { optimizeBasket } from "../algorithms/basket";
import type { TaxHolidayWindowInput } from "../algorithms/basket";
import { GRADE_LEVELS } from "../contracts/school";
import type { GradeLevel } from "../contracts/school";
import { INTAKE_METHODS } from "../contracts/requirement";
import type { IntakeMethod } from "../contracts/requirement";
import { ITEM_CONDITIONS } from "../contracts/household";
import type { ProvenanceRecord } from "../contracts/provenance";
import { provenanceFromFixture } from "../ingestion/provenance";
import { isoFromMs } from "../ingestion/types";
import type { IngestedRecord } from "../ingestion/types";
import type { RecallBundle } from "../ingestion/adapters/cpsc-recalls";
import {
  parseManualIntake,
  parsePasteIntake,
  parseUploadIntake,
  getLexiconEntry,
} from "../parsing";
import type { ManualEntryItem, ParseLogEvent, ParseOutcome } from "../parsing";
import type { ApiDeps } from "./deps";
import type { RouteContext, RouteDef, RouteResult } from "./http";
import { createRouter } from "./http";
import type {
  AlertSubscribeBody,
  BasketBody,
  CapsuleBody,
  ConfirmListBody,
  ConfirmedRequirementInput,
  InventoryBody,
  ManualIntakeBody,
  PasteIntakeBody,
  RecallCheckBody,
  RecallEntry,
  RequirementSummary,
  SuppressionNote,
} from "./contracts";
import { ALERT_KINDS, CORE_ACCESS_NOTICE } from "./contracts";
import { STRIPE_SIGNATURE_HEADER } from "./stripe";
import { invalidRequest, validationFailed, ApiError } from "./errors";
import { filterProvenanced } from "./provenance-gate";
import { envelopeProvenance, deriveCandidates, lookupSalesTax } from "./catalog";
import { computeMergePlan, deriveBasketInputs } from "./plan";
import type { MergeComputation } from "./plan";
import { createSourcePipelines, serveSource, sourceStatus } from "./sources";
import { sha256Hex } from "./session";
import * as store from "./store";

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const MAX_BODY_BYTES = 1_000_000;
const MAX_UPLOAD_BYTES = 8_000_000;
const MAX_PASTE_CHARS = 40_000;
const MAX_ITEMS = 100;

async function readJson<T>(request: Request): Promise<T> {
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) throw invalidRequest("request body too large");
  try {
    return JSON.parse(text) as T;
  } catch {
    throw invalidRequest("request body must be valid JSON");
  }
}

const isPositiveInt = (v: unknown): v is number =>
  typeof v === "number" && Number.isInteger(v) && v > 0;

/** Forwards parse-pipeline log events through the §1.7 allowlist logger. */
const parseLogger =
  (deps: ApiDeps) =>
  (event: ParseLogEvent): void =>
    deps.logger.log(event.event, { ...event.fields, intakeId: event.intakeId });

function intakeResult(deps: ApiDeps, outcome: ParseOutcome): RouteResult {
  const provenance: Record<string, ProvenanceRecord> = {};
  for (const item of outcome.items) provenance[item.provenance.id] = item.provenance;
  return {
    data: {
      intakeId: outcome.intakeId,
      review: outcome.review,
      itemProvenance: outcome.items.map((item) => ({
        lineNumber: item.lineNumber,
        provenanceIds: [item.provenance.id],
      })),
    },
    provenance,
  };
}

/**
 * Allowlist mapping from the confirm payload into ManualEntryItem: fields
 * are picked EXPLICITLY, so no free text (originalText, interpretation,
 * anything smuggled) can travel into validation or persistence (P3-2).
 */
function toManualEntry(item: ConfirmedRequirementInput): ManualEntryItem {
  return {
    productTypeSlug: String(item.productTypeSlug ?? ""),
    quantity: item.quantity as number,
    unit: item.unit,
    packCount: item.packCount ?? null,
    dimensions: item.dimensions ?? null,
    material: item.material ?? null,
    color: item.color ?? null,
    rulingStyle: item.rulingStyle ?? null,
    brandRequirement: item.brandRequirement,
    requiredBrandSlug: item.requiredBrandSlug ?? null,
    optionality: item.optionality,
    prohibitedSubstitutions: item.prohibitedSubstitutions ?? [],
  };
}

async function loadMergeComputation(
  deps: ApiDeps,
  householdId: string,
): Promise<MergeComputation> {
  const rows = await store.listHouseholdRequirements(deps.db, householdId);
  const inventory = await store.listInventory(deps.db, householdId);
  return computeMergePlan(rows, inventory);
}

const mergeFindingNotes = (merge: MergeComputation): SuppressionNote[] =>
  merge.listFindings
    .filter((f) => f.decision.action !== "render")
    .map((f) => ({ subject: `list:${f.listId}`, decision: f.decision }));

/* ------------------------------------------------------------------ */
/* Handlers                                                            */
/* ------------------------------------------------------------------ */

async function handleSession(ctx: RouteContext): Promise<RouteResult> {
  const session = ctx.session!;
  const householdState = await store.getHouseholdState(ctx.deps.db, session.householdId);
  const memberOrdinals = await store.listMemberOrdinals(ctx.deps.db, session.householdId);
  return {
    data: {
      established: true,
      householdPresent: true,
      householdState,
      memberOrdinals,
    },
  };
}

async function handlePasteIntake(ctx: RouteContext): Promise<RouteResult> {
  const body = await readJson<PasteIntakeBody>(ctx.request);
  if (typeof body.text !== "string" || body.text.length === 0) {
    throw invalidRequest("field 'text' must be a non-empty string");
  }
  if (body.text.length > MAX_PASTE_CHARS) {
    throw invalidRequest("field 'text' exceeds the paste size limit");
  }
  const outcome = parsePasteIntake(
    { intakeId: `in_${ctx.deps.ids()}`, text: body.text },
    { clock: ctx.deps.clock, logger: parseLogger(ctx.deps) },
  );
  return intakeResult(ctx.deps, outcome);
}

async function handleManualIntake(ctx: RouteContext): Promise<RouteResult> {
  const body = await readJson<ManualIntakeBody>(ctx.request);
  if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > MAX_ITEMS) {
    throw invalidRequest(`field 'items' must be a non-empty array (max ${MAX_ITEMS})`);
  }
  const outcome = parseManualIntake(
    { intakeId: `in_${ctx.deps.ids()}`, items: body.items.map(toManualEntry) },
    { clock: ctx.deps.clock, logger: parseLogger(ctx.deps) },
  );
  return intakeResult(ctx.deps, outcome);
}

async function handleUploadIntake(ctx: RouteContext): Promise<RouteResult> {
  const contentType = ctx.request.headers.get("content-type") ?? "";
  if (!/^image\/(png|jpeg|webp)$|^application\/pdf$/.test(contentType)) {
    throw invalidRequest("upload content-type must be image/png, image/jpeg, image/webp, or application/pdf");
  }
  const bytes = new Uint8Array(await ctx.request.arrayBuffer());
  if (bytes.byteLength === 0) throw invalidRequest("upload body is empty");
  if (bytes.byteLength > MAX_UPLOAD_BYTES) throw invalidRequest("upload exceeds the size limit");

  // Content-addressed transient key: deterministic for tests, opaque always.
  const digest = await sha256Hex(bytes);
  const objectKey = `uploads/upl-${digest.slice(0, 24)}`;
  await ctx.deps.uploadBuffer.put(objectKey, bytes, contentType);
  const outcome = await parseUploadIntake(
    {
      intakeId: `in_${ctx.deps.ids()}`,
      objectKey,
      buffer: ctx.deps.uploadBuffer,
      ocr: ctx.deps.ocr,
    },
    { clock: ctx.deps.clock, logger: parseLogger(ctx.deps) },
  );
  return intakeResult(ctx.deps, outcome);
}

async function handleConfirmList(ctx: RouteContext): Promise<RouteResult> {
  const deps = ctx.deps;
  const session = ctx.session!;
  const body = await readJson<ConfirmListBody>(ctx.request);

  if (!INTAKE_METHODS.includes(body.intakeMethod as IntakeMethod)) {
    throw invalidRequest("field 'intakeMethod' must be paste | manual | upload");
  }
  if (typeof body.schoolYear !== "string" || !/^\d{4}-\d{4}$/.test(body.schoolYear)) {
    throw invalidRequest("field 'schoolYear' must look like '2026-2027'");
  }
  if (!isPositiveInt(body.memberOrdinal) || body.memberOrdinal > 12) {
    throw invalidRequest("field 'memberOrdinal' must be a positive integer (max 12)");
  }
  const gradeLevel = body.gradeLevel ?? null;
  if (gradeLevel !== null && !GRADE_LEVELS.includes(gradeLevel as GradeLevel)) {
    throw invalidRequest("field 'gradeLevel' must be K-8");
  }
  const state = body.state ?? null;
  if (state !== null && !/^[A-Z]{2}$/.test(state)) {
    throw invalidRequest("field 'state' must be a two-letter USPS code");
  }
  if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > MAX_ITEMS) {
    throw invalidRequest(`field 'items' must be a non-empty array (max ${MAX_ITEMS})`);
  }

  // Controlled-vocabulary validation via the Phase 3 manual-entry validator
  // (throws ManualEntryValidationError -> 422). Free prose cannot pass.
  const manualItems = body.items.map(toManualEntry);
  const validated = parseManualIntake(
    { intakeId: `confirm_${deps.ids()}`, items: manualItems },
    { clock: deps.clock },
  );

  const drafts = validated.items.map((item, index) => {
    const raw = body.items[index]?.sourceConfidence;
    const sourceConfidence =
      typeof raw === "number" && raw >= 0 && raw <= 1 ? raw : 1;
    return { draft: item.draft, sourceConfidence };
  });

  if (state !== null) await store.setHouseholdState(deps.db, session.householdId, state);
  const memberId = await store.ensureMember(
    deps.db,
    deps.ids,
    deps.clock,
    session.householdId,
    body.memberOrdinal,
    gradeLevel as GradeLevel | null,
  );
  const persisted = await store.persistConfirmedList(deps.db, deps.ids, deps.clock, {
    householdId: session.householdId,
    memberId,
    intakeMethod: body.intakeMethod,
    schoolYear: body.schoolYear,
    gradeLevel: gradeLevel as GradeLevel | null,
    drafts,
  });

  deps.logger.log("list_confirmed", {
    listId: persisted.listId,
    requirementCount: persisted.requirements.length,
    memberOrdinal: body.memberOrdinal,
    intakeMethod: body.intakeMethod,
  });

  return {
    status: 201,
    data: {
      listId: persisted.listId,
      memberOrdinal: body.memberOrdinal,
      verificationStatus: "user_confirmed" as const,
      requirements: persisted.requirements,
    },
    provenance: await store.getProvenanceRecords(deps.db, persisted.provenanceIds),
  };
}

async function handleLists(ctx: RouteContext): Promise<RouteResult> {
  if (ctx.session === null) return { data: { lists: [] } };
  const rows = await store.listHouseholdRequirements(ctx.deps.db, ctx.session.householdId);
  const byList = new Map<
    string,
    { row: (typeof rows)[number]; requirements: Map<string, RequirementSummary>; ordinals: Set<number> }
  >();
  for (const row of rows) {
    const entry =
      byList.get(row.list_id) ??
      { row, requirements: new Map<string, RequirementSummary>(), ordinals: new Set<number>() };
    entry.ordinals.add(row.ordinal);
    entry.requirements.set(row.id, {
      id: row.id,
      listId: row.list_id,
      productTypeSlug: row.product_type_slug,
      quantity: row.quantity,
      unit: row.unit as RequirementSummary["unit"],
      packCount: row.pack_count,
      dimensions: row.dimensions,
      material: row.material,
      color: row.color,
      rulingStyle: row.ruling_style as RequirementSummary["rulingStyle"],
      brandRequirement: row.brand_requirement as RequirementSummary["brandRequirement"],
      requiredBrandSlug: store.brandSlugFromId(row.required_brand_id),
      optionality: row.optionality as RequirementSummary["optionality"],
      prohibitedSubstitutions: row.prohibited_substitutions
        ? (JSON.parse(row.prohibited_substitutions) as string[])
        : [],
      sourceKind: row.source_kind as RequirementSummary["sourceKind"],
      sourceConfidence: row.source_confidence,
      provenanceIds: [row.provenance_id],
    });
    byList.set(row.list_id, entry);
  }
  const lists = [...byList.values()].map((entry) => ({
    listId: entry.row.list_id,
    schoolYear: entry.row.school_year,
    gradeLevel: entry.row.grade_level as GradeLevel | null,
    intakeMethod: entry.row.intake_method as IntakeMethod,
    verificationStatus: entry.row.verification_status,
    memberOrdinals: [...entry.ordinals].sort((a, b) => a - b),
    requirements: [...entry.requirements.values()],
  }));
  const provenance = await store.getProvenanceRecords(
    ctx.deps.db,
    rows.map((r) => r.provenance_id),
  );
  return { data: { lists }, provenance };
}

async function handleInventoryWrite(ctx: RouteContext): Promise<RouteResult> {
  const session = ctx.session!;
  const body = await readJson<InventoryBody>(ctx.request);
  if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > MAX_ITEMS) {
    throw invalidRequest(`field 'items' must be a non-empty array (max ${MAX_ITEMS})`);
  }
  const saved = [];
  for (const item of body.items) {
    if (typeof item.productTypeSlug !== "string") {
      throw invalidRequest("inventory items need a productTypeSlug");
    }
    if (!isPositiveInt(item.quantity) || item.quantity > 999) {
      throw invalidRequest("inventory quantity must be a positive integer");
    }
    if (!ITEM_CONDITIONS.includes(item.condition)) {
      throw invalidRequest("inventory condition must be new | usable | worn_out");
    }
    saved.push(
      await store.insertInventoryItem(ctx.deps.db, ctx.deps.ids, ctx.deps.clock, session.householdId, {
        productTypeSlug: item.productTypeSlug,
        quantity: item.quantity,
        condition: item.condition,
      }),
    );
  }
  const provenance = await store.getProvenanceRecords(
    ctx.deps.db,
    saved.flatMap((s) => [...s.provenanceIds]),
  );
  return { status: 201, data: { items: saved }, provenance };
}

async function handleInventoryRead(ctx: RouteContext): Promise<RouteResult> {
  if (ctx.session === null) return { data: { items: [] } };
  const rows = await store.listInventory(ctx.deps.db, ctx.session.householdId);
  const items = rows.map((r) => ({
    id: r.id,
    productTypeSlug: r.product_type_slug,
    quantity: r.quantity,
    condition: r.condition,
    provenanceIds: [r.provenance_id],
  }));
  const provenance = await store.getProvenanceRecords(
    ctx.deps.db,
    rows.map((r) => r.provenance_id),
  );
  return { data: { items }, provenance };
}

async function handleMerge(ctx: RouteContext): Promise<RouteResult> {
  if (ctx.session === null) {
    return { data: { lines: [], requiredLineKeys: [], listFindings: [] } };
  }
  const merge = await loadMergeComputation(ctx.deps, ctx.session.householdId);
  const provenance = await store.getProvenanceRecords(ctx.deps.db, merge.provenanceIds);
  ctx.deps.logger.log("merge_computed", {
    lineCount: merge.lines.length,
    suppressedCount: merge.listFindings.filter((f) => f.decision.action !== "render").length,
  });
  return {
    data: {
      lines: merge.lines,
      requiredLineKeys: merge.lines
        .filter((l) => l.optionality === "required")
        .map((l) => l.key),
      listFindings: merge.listFindings,
    },
    provenance,
    suppressions: mergeFindingNotes(merge),
  };
}

async function handleChecklist(ctx: RouteContext): Promise<RouteResult> {
  if (ctx.session === null) {
    return { data: { generatedAt: isoFromMs(ctx.deps.clock()), memberOrdinals: [], lines: [] } };
  }
  const merge = await loadMergeComputation(ctx.deps, ctx.session.householdId);
  const memberOrdinals = await store.listMemberOrdinals(ctx.deps.db, ctx.session.householdId);
  const lines = merge.lines.map((line) => ({
    key: line.key,
    productTypeSlug: line.productTypeSlug,
    displayName: getLexiconEntry(line.productTypeSlug)?.displayName ?? line.productTypeSlug,
    dimensions: line.dimensions,
    rulingStyle: line.rulingStyle,
    color: line.color,
    optionality: line.optionality,
    unitsToBuy: line.unitsToBuy,
    netRequiredUnits: line.netRequiredUnits,
    grossRequiredUnits: line.grossRequiredUnits,
    usableInventoryUnits: line.usableInventoryUnits,
    perMember: line.perMember,
    provenanceIds: line.provenanceIds,
  }));
  const provenance = await store.getProvenanceRecords(ctx.deps.db, merge.provenanceIds);
  return {
    data: { generatedAt: isoFromMs(ctx.deps.clock()), memberOrdinals, lines },
    provenance,
    suppressions: mergeFindingNotes(merge),
  };
}

async function handleBasket(ctx: RouteContext): Promise<RouteResult> {
  const deps = ctx.deps;
  const body = await readJson<BasketBody>(ctx.request);
  const daysUntilNeeded =
    body.daysUntilNeeded === undefined || body.daysUntilNeeded === null
      ? null
      : body.daysUntilNeeded;
  if (daysUntilNeeded !== null && !isPositiveInt(daysUntilNeeded)) {
    throw invalidRequest("field 'daysUntilNeeded' must be a positive integer");
  }
  const requestedState = body.state ?? null;
  if (requestedState !== null && !/^[A-Z]{2}$/.test(requestedState)) {
    throw invalidRequest("field 'state' must be a two-letter USPS code");
  }

  if (ctx.session === null) {
    return {
      data: {
        basket: null,
        itemMatches: [],
        coveredLineKeys: [],
        optionalLineKeysExcluded: [],
        purchaseDate: isoFromMs(deps.clock()).slice(0, 10),
        state: requestedState,
      },
    };
  }

  const merge = await loadMergeComputation(deps, ctx.session.householdId);
  const state =
    requestedState ?? (await store.getHouseholdState(deps.db, ctx.session.householdId));

  const pipelines = createSourcePipelines(deps);
  const offersEnv = await serveSource(pipelines.offers);
  const recallsEnv = await serveSource(pipelines.recalls);
  const holidaysEnv = await serveSource(pipelines.taxHolidays);

  const derivation = deriveCandidates(
    offersEnv.records,
    deps.fixtures.catalog,
    deps.fixtures.logistics,
    deps.clock,
  );
  const recallRefs: RecallProductRef[] = recallsEnv.records.flatMap((r) =>
    r.record.products.map((p) => ({ recallId: p.recallId, upc: p.upc })),
  );
  const holidays: TaxHolidayWindowInput[] = holidaysEnv.records.map((r) => ({
    state: r.record.holiday.state,
    startsOn: r.record.holiday.startsOn,
    endsOn: r.record.holiday.endsOn,
    categories: r.record.categories.map((c) => ({
      category: c.category,
      priceCapCents: c.priceCapCents,
    })),
    // Fixture calendars are NEVER verified — the caveat survives to render.
    verified: false,
    provenanceId: r.provenance.id,
  }));
  const tax = lookupSalesTax(state, deps.fixtures.taxRates, deps.clock);
  const purchaseDate = isoFromMs(deps.clock()).slice(0, 10);

  const inputs = deriveBasketInputs({
    merge,
    candidatesBySlug: derivation.bySlug,
    recallRefs,
    holidays,
    state,
    salesTaxRate: tax.rate,
    salesTaxBasis: tax.assumption,
    purchaseDate,
    daysUntilNeeded,
    nowMs: deps.clock(),
  });

  const basket = inputs.items.length === 0 ? null : optimizeBasket(inputs.items, inputs.offers, inputs.ctx);

  const suppressions = [...mergeFindingNotes(merge), ...inputs.suppressions];
  for (const unresolved of derivation.unresolvedOffers) {
    suppressions.push({
      subject: `offer:${unresolved.offerKey}`,
      decision: combineFindings([
        {
          reason: "unresolved_product_variant",
          action: "suppress",
          detail: unresolved.reason,
        },
      ]),
    });
  }
  if (basket !== null && daysUntilNeeded !== null) {
    const views = basket.views;
    for (const [name, view] of Object.entries(views)) {
      if (view === null) continue;
      const finding = evaluateDeadlineFeasibility({
        daysUntilNeeded,
        estimatedDeliveryDays: view.deliveryDaysMax,
      });
      if (finding !== null) {
        suppressions.push({ subject: `view:${name}`, decision: combineFindings([finding]) });
      }
    }
  }

  const provenance: Record<string, ProvenanceRecord> = {
    ...derivation.provenance,
    ...envelopeProvenance(holidaysEnv),
    ...envelopeProvenance(recallsEnv),
    ...(await store.getProvenanceRecords(deps.db, merge.provenanceIds)),
  };
  if (tax.provenance) provenance[tax.provenance.id] = tax.provenance;

  deps.logger.log("basket_computed", {
    feasible: basket?.feasible ?? false,
    optionCount: basket?.options.length ?? 0,
    frontierSize: basket?.frontier.length ?? 0,
    suppressedCount: suppressions.length,
  });

  return {
    data: {
      basket,
      itemMatches: inputs.itemMatches,
      coveredLineKeys: inputs.coveredLineKeys,
      optionalLineKeysExcluded: inputs.optionalLineKeysExcluded,
      purchaseDate,
      state,
    },
    provenance,
    suppressions,
    assumptions: [...(basket?.assumptions ?? [tax.assumption]), ...derivation.assumptions],
    sources: [sourceStatus(offersEnv), sourceStatus(recallsEnv), sourceStatus(holidaysEnv)],
  };
}

async function handleCapsule(ctx: RouteContext): Promise<RouteResult> {
  const deps = ctx.deps;
  const body = await readJson<CapsuleBody>(ctx.request);
  if (!Array.isArray(body.categories) || body.categories.length === 0) {
    throw invalidRequest("field 'categories' must be a non-empty array");
  }
  for (const cat of body.categories) {
    if (!GARMENT_CATEGORIES.includes(cat.category)) {
      throw invalidRequest("capsule category must be tops | bottoms | outer_layer | socks");
    }
    if (!CLIMATE_BANDS.includes(cat.climateBand)) {
      throw invalidRequest("climateBand must be hot | temperate | cold");
    }
  }
  const provId = `prov:user:capsule:${deps.ids()}`;
  const capsuleProv = store.userProvenance(
    "user:capsule-input",
    provId,
    deps.clock,
    "Capsule math over user-entered wash cadence and inventory; rewears-per-unit is a labeled model-constant range, never a fact.",
  );
  const provenance: Record<string, ProvenanceRecord> = { [provId]: capsuleProv };

  let lines;
  try {
    lines = body.categories.map((cat: CapsuleCategoryInput) => ({
      ...computeCapsuleCategory(cat),
      provenanceIds: [provId],
    }));
  } catch (err) {
    if (err instanceof RangeError) throw validationFailed(err.message);
    throw err;
  }

  let timing = null;
  if (body.timing) {
    const t = body.timing;
    if (!isPositiveInt(t.daysUntilNeeded) || !isPositiveInt(t.typicalDeliveryDays) || !isPositiveInt(t.currentPriceCents)) {
      throw invalidRequest("timing fields must be positive integers");
    }
    const timingProvIds = [provId];
    let rollingMedianCents: number | null = null;
    if (t.upc) {
      const points = deps.fixtures.priceHistory.records.filter((r) => r.upc === t.upc);
      if (points.length >= 5) {
        rollingMedianCents = median(points.map((p) => p.priceCents));
        const histProv = provenanceFromFixture(
          deps.fixtures.priceHistory.provenance,
          `window-${t.upc}`,
          deps.clock,
        );
        provenance[histProv.id] = histProv;
        timingProvIds.push(histProv.id);
      }
    }
    timing = {
      ...buyNowVsWait({
        daysUntilNeeded: t.daysUntilNeeded,
        typicalDeliveryDays: t.typicalDeliveryDays,
        currentPriceCents: t.currentPriceCents,
        rollingMedianCents,
      }),
      provenanceIds: timingProvIds,
    };
  }

  return {
    data: { lines, timing },
    provenance,
    assumptions: lines.flatMap((l) => [...l.assumptions]),
  };
}

async function handleTrend(ctx: RouteContext): Promise<RouteResult> {
  const deps = ctx.deps;
  const slug = ctx.params["slug"]!;
  const doc = deps.fixtures.trendSignals;
  const provenance: Record<string, ProvenanceRecord> = {};
  const series: FamilySeriesInput[] = [];
  doc.records
    .filter((r) => r.productSlug === slug)
    .forEach((r, index) => {
      if (!SIGNAL_FAMILIES.includes(r.family as SignalFamily)) return;
      const prov = provenanceFromFixture(
        doc.provenance,
        `trend-${slug}-${r.family}-${index}`,
        deps.clock,
      );
      provenance[prov.id] = prov;
      series.push({
        family: r.family as SignalFamily,
        values: r.values,
        latestObservedAtMs: Date.parse(r.latestObservedAt),
        sponsoredShare: r.sponsoredShare,
        geography: r.geography,
        provenanceIds: [prov.id],
      });
    });

  const nowMs = deps.clock();
  const evaluations = series.map((s) => evaluateFamily(s, nowMs));
  const classification = classifyTrend(evaluations);

  // Defense in depth (§1.3): no path other than classifyTrend may claim
  // "viral"; the guard suppresses a claim the evidence cannot carry.
  const guard = evaluateTrendClaim({
    claimedLabel: classification.label,
    organicPassingFamilyCount: classification.organicPassingFamilies.length,
  });
  const label = guard === null ? classification.label : "insufficient_evidence";

  const datasetProv = provenanceFromFixture(doc.provenance, `trend-${slug}-dataset`, deps.clock);
  provenance[datasetProv.id] = datasetProv;

  return {
    data: {
      productSlug: slug,
      label,
      confidence: classification.confidence,
      organicPassingFamilies: classification.organicPassingFamilies,
      familyEvaluations: classification.familyEvaluations,
      reasons: classification.reasons,
      provenanceIds: [datasetProv.id, ...Object.keys(provenance).filter((id) => id !== datasetProv.id)].sort(),
    },
    provenance,
    suppressions:
      guard === null ? [] : [{ subject: `trend:${slug}`, decision: combineFindings([guard]) }],
  };
}

function recallEntries(
  records: readonly IngestedRecord<RecallBundle>[],
): RecallEntry[] {
  return records.map(({ record, provenance }) => ({
    recall: record.recall,
    products: record.products,
    provenanceIds: [provenance.id],
  }));
}

async function handleRecalls(ctx: RouteContext): Promise<RouteResult> {
  const pipelines = createSourcePipelines(ctx.deps);
  const envelope = await serveSource(pipelines.recalls);
  const provenance = envelopeProvenance(envelope);
  const { kept, suppressedCount } = filterProvenanced(recallEntries(envelope.records), provenance);
  return {
    data: { recalls: kept },
    provenance,
    suppressions:
      suppressedCount === 0
        ? []
        : [
            {
              subject: "recalls:list",
              decision: combineFindings([
                {
                  reason: "recalled_or_under_review",
                  action: "downgrade",
                  detail: `${suppressedCount} recall record(s) suppressed for incomplete provenance`,
                },
              ]),
            },
          ],
    sources: [sourceStatus(envelope)],
  };
}

async function handleRecallCheck(ctx: RouteContext): Promise<RouteResult> {
  const body = await readJson<RecallCheckBody>(ctx.request);
  if (typeof body.upc !== "string" || body.upc.length === 0 || body.upc.length > 64) {
    throw invalidRequest("field 'upc' must be a non-empty string");
  }
  const pipelines = createSourcePipelines(ctx.deps);
  const envelope = await serveSource(pipelines.recalls);
  const provenance = envelopeProvenance(envelope);
  const matches = recallEntries(
    envelope.records.filter(({ record }) =>
      record.products.some((p) => p.upc !== null && p.upc === body.upc),
    ),
  );
  const decision = combineFindings([
    matches.length > 0
      ? evaluateRecallStatus({ recallMatch: "matched", correctionStatus: "none" })
      : null,
  ]);
  return {
    data: { upc: body.upc, matches, decision },
    provenance,
    sources: [sourceStatus(envelope)],
  };
}

async function handleAlertSubscribe(ctx: RouteContext): Promise<RouteResult> {
  const deps = ctx.deps;
  const session = ctx.session!;
  const body = await readJson<AlertSubscribeBody>(ctx.request);
  if (!ALERT_KINDS.includes(body.alertKind)) {
    throw invalidRequest("field 'alertKind' must be recall | price_change | deadline | list_correction");
  }
  const productTypeSlug = body.productTypeSlug ?? null;
  const listId = body.listId ?? null;
  if (listId !== null) {
    const owned = await deps.db
      .prepare(`SELECT id FROM supply_lists WHERE id = ? AND household_id = ?`)
      .bind(listId, session.householdId)
      .first<{ id: string }>();
    if (!owned) throw validationFailed("listId does not belong to this session's household");
  }
  const saved = await store.insertAlertSubscription(
    deps.db,
    deps.ids,
    deps.clock,
    session.householdId,
    body.alertKind,
    productTypeSlug,
    listId,
  );
  deps.logger.log("alert_subscribed", { subscriptionId: saved.id, alertKind: body.alertKind });
  return {
    status: 201,
    data: { subscriptionId: saved.id, alertKind: body.alertKind },
  };
}

async function handleAlertsList(ctx: RouteContext): Promise<RouteResult> {
  if (ctx.session === null) return { data: { subscriptions: [] } };
  const rows = await store.listAlertSubscriptions(ctx.deps.db, ctx.session.householdId);
  const subscriptions = rows.map((r) => ({
    id: r.id,
    alertKind: r.alert_kind,
    productTypeSlug: r.product_type_slug,
    listId: r.list_id,
    provenanceIds: [r.provenance_id],
  }));
  const provenance = await store.getProvenanceRecords(
    ctx.deps.db,
    rows.map((r) => r.provenance_id),
  );
  return { data: { subscriptions }, provenance };
}

async function handleEntitlements(ctx: RouteContext): Promise<RouteResult> {
  const base = {
    gates: { adFreeExtras: false },
    coreAccessNotice: CORE_ACCESS_NOTICE,
  };
  if (ctx.session === null) return { data: { seasonPass: null, ...base } };
  const row = await store.activeEntitlement(
    ctx.deps.db,
    ctx.session.householdId,
    isoFromMs(ctx.deps.clock()),
  );
  ctx.deps.logger.log("entitlements_read", { entitlementPresent: row !== null });
  if (row === null) return { data: { seasonPass: null, ...base } };
  const provenance = await store.getProvenanceRecords(ctx.deps.db, [row.provenance_id]);
  return {
    data: {
      seasonPass: {
        kind: row.kind,
        status: row.status,
        validFrom: row.valid_from,
        validUntil: row.valid_until,
        provenanceIds: [row.provenance_id],
      },
      gates: { adFreeExtras: true },
      coreAccessNotice: CORE_ACCESS_NOTICE,
    },
    provenance,
  };
}

async function handleStripeWebhook(ctx: RouteContext): Promise<RouteResult> {
  const deps = ctx.deps;
  const rawBody = await ctx.request.text();
  if (rawBody.length > MAX_BODY_BYTES) throw invalidRequest("request body too large");
  const verification = await deps.stripeWebhooks.verify(
    rawBody,
    ctx.request.headers.get(STRIPE_SIGNATURE_HEADER),
  );
  if (!verification.ok) {
    throw new ApiError(
      "webhook_verification_failed",
      400,
      `webhook rejected: ${verification.reason}`,
    );
  }
  const event = verification.event;
  let entitlementId: string | null = null;
  if (event.eventType === "season_pass.purchased") {
    const household = await deps.db
      .prepare(`SELECT id FROM households WHERE id = ?`)
      .bind(event.householdRef)
      .first<{ id: string }>();
    if (household) {
      entitlementId = await store.insertEntitlement(
        deps.db,
        deps.ids,
        deps.clock,
        household.id,
        event.validFrom,
        event.validUntil,
        event.paymentRef,
      );
    }
  } else {
    await store.refundEntitlementByPaymentRef(deps.db, event.paymentRef);
  }
  deps.logger.log("webhook_processed", { eventType: event.eventType });
  return { data: { received: true as const, entitlementId } };
}

/* ------------------------------------------------------------------ */
/* Route table                                                         */
/* ------------------------------------------------------------------ */

export const ROUTES: readonly RouteDef[] = [
  { method: "GET", pattern: "/api/session", category: "session", session: "ensure", turnstile: false, rateLimit: null, entitlementGated: false, handler: handleSession },
  { method: "POST", pattern: "/api/intake/paste", category: "core_required_data", session: "ensure", turnstile: false, rateLimit: null, entitlementGated: false, handler: handlePasteIntake },
  { method: "POST", pattern: "/api/intake/manual", category: "core_required_data", session: "ensure", turnstile: false, rateLimit: null, entitlementGated: false, handler: handleManualIntake },
  { method: "POST", pattern: "/api/intake/upload", category: "core_required_data", session: "ensure", turnstile: true, rateLimit: "upload", entitlementGated: false, handler: handleUploadIntake },
  { method: "POST", pattern: "/api/lists/confirm", category: "core_required_data", session: "ensure", turnstile: false, rateLimit: null, entitlementGated: false, handler: handleConfirmList },
  { method: "GET", pattern: "/api/lists", category: "core_required_data", session: "read", turnstile: false, rateLimit: null, entitlementGated: false, handler: handleLists },
  { method: "POST", pattern: "/api/inventory", category: "core_required_data", session: "ensure", turnstile: false, rateLimit: null, entitlementGated: false, handler: handleInventoryWrite },
  { method: "GET", pattern: "/api/inventory", category: "core_required_data", session: "read", turnstile: false, rateLimit: null, entitlementGated: false, handler: handleInventoryRead },
  { method: "GET", pattern: "/api/plan/merge", category: "core_required_data", session: "read", turnstile: false, rateLimit: null, entitlementGated: false, handler: handleMerge },
  { method: "POST", pattern: "/api/plan/basket", category: "core_required_data", session: "read", turnstile: false, rateLimit: null, entitlementGated: false, handler: handleBasket },
  { method: "GET", pattern: "/api/plan/checklist", category: "core_required_data", session: "read", turnstile: false, rateLimit: null, entitlementGated: false, handler: handleChecklist },
  { method: "POST", pattern: "/api/capsule", category: "core_required_data", session: "none", turnstile: false, rateLimit: null, entitlementGated: false, handler: handleCapsule },
  { method: "GET", pattern: "/api/trend/:slug", category: "evidence", session: "none", turnstile: false, rateLimit: null, entitlementGated: false, handler: handleTrend },
  { method: "GET", pattern: "/api/recalls", category: "safety", session: "none", turnstile: false, rateLimit: null, entitlementGated: false, handler: handleRecalls },
  { method: "POST", pattern: "/api/recalls/check", category: "safety", session: "none", turnstile: false, rateLimit: null, entitlementGated: false, handler: handleRecallCheck },
  { method: "POST", pattern: "/api/alerts/subscribe", category: "safety", session: "ensure", turnstile: true, rateLimit: "alerts", entitlementGated: false, handler: handleAlertSubscribe },
  { method: "GET", pattern: "/api/alerts", category: "safety", session: "read", turnstile: false, rateLimit: null, entitlementGated: false, handler: handleAlertsList },
  { method: "GET", pattern: "/api/entitlements", category: "payments", session: "read", turnstile: false, rateLimit: null, entitlementGated: false, handler: handleEntitlements },
  { method: "POST", pattern: "/api/webhooks/stripe", category: "payments", session: "none", turnstile: false, rateLimit: null, entitlementGated: false, handler: handleStripeWebhook },
];

export const handleApiRequest = createRouter(ROUTES);
