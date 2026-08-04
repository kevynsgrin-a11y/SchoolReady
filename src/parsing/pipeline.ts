/**
 * Parsing pipeline (Phase 3): intake -> [OCR] -> PII redaction ->
 * normalization -> confidence scoring -> SS1.4 provenance -> review payload.
 *
 * Channel rules (handoff 03 SS8, SS0 NOT #1):
 *  - paste / manual / upload are USER channels; there is no URL-fetch intake
 *    and none may be added. Nothing here performs network I/O.
 *  - every parsed fact carries a full ProvenanceRecord BEFORE anything else
 *    happens to it; provenanceDefect() (Phase 2 helper) is the gate.
 *  - upload buffers are deleted in `finally` — ephemeral by construction.
 *  - the logger receives counts/categories/opaque ids ONLY (SS1.7).
 */
import type {
  Confidence,
  IntakeMethod,
  ProvenanceRecord,
  RequirementScope,
  RequirementSourceKind,
  SourceType,
  Unit,
} from "../contracts";
import { sanitizeProhibitedSubstitutions } from "../contracts/constraint";
import { provenanceDefect } from "../ingestion/provenance";
import { isoFromMs } from "../ingestion/types";
import type { Clock } from "../ingestion/types";
import { getLexiconEntry, COLOR_WORDS, MATERIAL_WORDS } from "./lexicon";
import type { OcrEngine } from "./ocr";
import { parseLine } from "./parse-line";
import type { ParsedLineCore } from "./parse-line";
import { redactPii } from "./pii";
import { buildReviewPayload } from "./review";
import type {
  ParsedItem,
  ParseLogger,
  ParseOutcome,
  ParsedRequirementDraft,
  PiiRedactionReport,
} from "./types";
import {
  ManualEntryValidationError,
  PARSER_TRANSFORM_VERSION,
  ParseProvenanceError,
} from "./types";
import type { UploadBuffer } from "./upload-buffer";

export interface IntakeOptions {
  clock: Clock;
  logger?: ParseLogger;
  /**
   * Fixture-corpus path: labels every parsed row as fixture data (SS1.4 —
   * fixture data must never masquerade as user data, and vice versa).
   */
  fixtureSet?: string;
}

/** Extraction output is never certainty: paste/upload confidence cap. */
const EXTRACTION_CONFIDENCE_CAP = 0.97;

/** Pages below this OCR confidence force review on their items (SS1.5). */
const OCR_REVIEW_THRESHOLD = 0.75;

const LIST_SCOPE: RequirementScope = {
  type: "list",
  grade: null,
  subject: null,
  slot: null,
};

const round2 = (n: number): number => Math.round(n * 100) / 100;

interface ChannelProfile {
  intakeMethod: IntakeMethod;
  sourceKind: RequirementSourceKind;
  source: string;
  sourceType: SourceType;
  transformVersion: string;
  limitations: string;
  confidenceFactor: number;
}

function channelProfile(
  intakeMethod: IntakeMethod,
  opts: IntakeOptions,
  ocrVersion?: string,
  ocrFactor?: number,
): ChannelProfile {
  const base = "Parsed proposal pending user confirmation; the parser proposes, the user confirms (SS1.5).";
  const transformVersion = ocrVersion
    ? `${PARSER_TRANSFORM_VERSION}+${ocrVersion}`
    : PARSER_TRANSFORM_VERSION;
  if (opts.fixtureSet) {
    return {
      intakeMethod,
      sourceKind: "fixture",
      source: opts.fixtureSet,
      sourceType: "fixture",
      transformVersion,
      limitations: `Synthetic fixture phrasing (${opts.fixtureSet}). ${base}`,
      confidenceFactor: ocrFactor ?? 1,
    };
  }
  switch (intakeMethod) {
    case "paste":
      return {
        intakeMethod,
        sourceKind: "paste",
        source: "user:paste-intake",
        sourceType: "user_entry",
        transformVersion,
        limitations: base,
        confidenceFactor: 1,
      };
    case "manual":
      return {
        intakeMethod,
        sourceKind: "manual",
        source: "user:manual-entry",
        sourceType: "user_entry",
        transformVersion: "none",
        limitations: base,
        confidenceFactor: 1,
      };
    case "upload":
      return {
        intakeMethod,
        sourceKind: "upload",
        source: "user:upload-intake",
        sourceType: "user_upload",
        transformVersion,
        limitations:
          `${base} OCR-extracted text; the uploaded file was processed ` +
          `ephemerally and deleted (SS1.7).`,
        confidenceFactor: ocrFactor ?? 1,
      };
  }
}

function buildProvenance(
  profile: ChannelProfile,
  intakeId: string,
  lineNumber: number,
  confidence: Confidence,
  clock: Clock,
): ProvenanceRecord {
  const now = isoFromMs(clock());
  return {
    id: `prov:${profile.sourceKind}:${intakeId}:${lineNumber}`,
    source: profile.source,
    sourceType: profile.sourceType,
    observedAt: now,
    retrievedAt: now,
    geography: "US",
    transformVersion: profile.transformVersion,
    freshness: "fresh",
    confidence,
    limitations: profile.limitations,
    correctionStatus: "none",
    createdAt: now,
  };
}

/** SS1.4 write-time gate, reusing the Phase 2 field-completeness helper. */
function assertItemsProvenance(intakeId: string, items: readonly ParsedItem[]): void {
  items.forEach((item, index) => {
    const defect = provenanceDefect(item.provenance);
    if (defect) throw new ParseProvenanceError(intakeId, `item ${index}: ${defect}`);
  });
}

interface TextParseInput {
  intakeId: string;
  redactedText: string;
  profile: ChannelProfile;
  clock: Clock;
  /** Per 1-based line number: extra confidence factor (upload OCR pages). */
  lineFactor?: (lineNumber: number) => number;
  /** Per 1-based line number: force review (low-OCR pages). */
  lineForcesReview?: (lineNumber: number) => boolean;
}

interface TextParseResult {
  items: ParsedItem[];
  skippedLineCount: number;
}

function parseRedactedText(input: TextParseInput): TextParseResult {
  const lines = input.redactedText.split(/\r?\n/);
  let scope: RequirementScope = LIST_SCOPE;
  let skippedLineCount = 0;
  const staged: Array<{
    lineNumber: number;
    originalText: string;
    core: ParsedLineCore;
    scope: RequirementScope;
  }> = [];

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const parsed = parseLine(line);
    if (parsed.kind === "heading") {
      scope = parsed.scope;
      skippedLineCount += 1;
      return;
    }
    if (parsed.kind === "noise") {
      if (line.trim().length > 0) skippedLineCount += 1;
      return;
    }
    staged.push({ lineNumber, originalText: line.trim(), core: parsed.item, scope });
  });

  // Cross-line ambiguity pass (SS1.5): if the list distinguishes sizes for a
  // product type elsewhere, a size-less line of the same type is ambiguous —
  // route to review, never guess a size.
  const slugsWithDims = new Set(
    staged
      .filter((s) => s.core.productTypeSlug !== null && s.core.dimensions !== null)
      .map((s) => s.core.productTypeSlug as string),
  );
  for (const s of staged) {
    if (
      s.core.productTypeSlug !== null &&
      s.core.dimensions === null &&
      slugsWithDims.has(s.core.productTypeSlug)
    ) {
      s.core.ambiguityFlags = [...new Set([...s.core.ambiguityFlags, "underspecified_variant_size" as const])].sort();
      s.core.needsReview = true;
      s.core.fieldConfidences["dimensions"] = 0.2;
    }
  }

  const items: ParsedItem[] = staged.map((s) => {
    const factor = input.lineFactor ? input.lineFactor(s.lineNumber) : 1;
    if (input.lineForcesReview?.(s.lineNumber)) {
      s.core.ambiguityFlags = [...new Set([...s.core.ambiguityFlags, "low_ocr_confidence" as const])].sort();
      s.core.needsReview = true;
    }
    const productConf = s.core.fieldConfidences["product"] ?? 0.2;
    const quantityConf = s.core.fieldConfidences["quantity"] ?? 0.2;
    const sourceConfidence = round2(
      Math.min(EXTRACTION_CONFIDENCE_CAP, Math.min(productConf, quantityConf)) *
        input.profile.confidenceFactor *
        factor,
    );
    const draft: ParsedRequirementDraft = {
      productTypeSlug: s.core.productTypeSlug,
      quantity: s.core.quantity,
      unit: s.core.unit,
      packCount: s.core.packCount,
      dimensions: s.core.dimensions,
      material: s.core.material,
      color: s.core.color,
      rulingStyle: s.core.rulingStyle,
      brandRequirement: s.core.brandRequirement,
      requiredBrandSlug: s.core.requiredBrandSlug,
      scope: s.scope,
      durability: s.core.durability,
      optionality: s.core.optionality,
      // Controlled codes only — the sanitizer throws on anything else.
      prohibitedSubstitutions: sanitizeProhibitedSubstitutions(
        s.core.prohibitedSubstitutions,
      ),
      sourceKind: input.profile.sourceKind,
      sourceConfidence,
    };
    return {
      lineNumber: s.lineNumber,
      originalText: s.originalText,
      draft,
      fieldConfidences: { ...s.core.fieldConfidences, sourceConfidence },
      productCandidates: s.core.productCandidates,
      ambiguityFlags: s.core.ambiguityFlags,
      needsReview: s.core.needsReview,
      provenance: buildProvenance(
        input.profile,
        input.intakeId,
        s.lineNumber,
        sourceConfidence,
        input.clock,
      ),
    };
  });

  return { items, skippedLineCount };
}

function finishOutcome(
  intakeId: string,
  profile: ChannelProfile,
  parsed: TextParseResult,
  redaction: PiiRedactionReport,
  opts: IntakeOptions,
): ParseOutcome {
  assertItemsProvenance(intakeId, parsed.items);
  const review = buildReviewPayload({
    intakeId,
    intakeMethod: profile.intakeMethod,
    items: parsed.items,
    redaction,
    skippedLineCount: parsed.skippedLineCount,
    parsedAt: isoFromMs(opts.clock()),
    parserVersion: profile.transformVersion,
  });
  opts.logger?.({
    event: "parse_complete",
    intakeId,
    fields: {
      intakeMethod: profile.intakeMethod,
      itemCount: parsed.items.length,
      itemsNeedingReview: review.itemsNeedingReview,
      skippedLineCount: parsed.skippedLineCount,
      overallConfidence: review.overallConfidence,
      redactionCategories: redaction.categoriesHit.join(","),
      redactionCount: redaction.redactionCount,
    },
  });
  return {
    intakeId,
    intakeMethod: profile.intakeMethod,
    items: parsed.items,
    review,
    redaction,
  };
}

export interface PasteIntakeRequest {
  intakeId: string;
  text: string;
}

/** Paste intake: deterministic text parsing, PII-redacted at the boundary. */
export function parsePasteIntake(
  request: PasteIntakeRequest,
  opts: IntakeOptions,
): ParseOutcome {
  const profile = channelProfile("paste", opts);
  const { text, report } = redactPii(request.text);
  opts.logger?.({
    event: "intake_received",
    intakeId: request.intakeId,
    fields: {
      intakeMethod: profile.intakeMethod,
      lineCount: text.split(/\r?\n/).length,
      redactionCount: report.redactionCount,
    },
  });
  const parsed = parseRedactedText({
    intakeId: request.intakeId,
    redactedText: text,
    profile,
    clock: opts.clock,
  });
  return finishOutcome(request.intakeId, profile, parsed, report, opts);
}

/**
 * Manual entry: structured fields from controlled vocabularies only — no
 * free prose exists on this channel, so PII cannot enter it (SS1.7 by
 * construction). Validation throws instead of guessing.
 */
export interface ManualEntryItem {
  productTypeSlug: string;
  quantity: number;
  unit?: Unit;
  packCount?: number | null;
  /** Product dimension descriptor: '1.5 in', '9x12 in', '8 oz', 'gallon'. */
  dimensions?: string | null;
  material?: string | null;
  color?: string | null;
  rulingStyle?: ParsedRequirementDraft["rulingStyle"];
  brandRequirement?: ParsedRequirementDraft["brandRequirement"];
  requiredBrandSlug?: string | null;
  optionality?: ParsedRequirementDraft["optionality"];
  prohibitedSubstitutions?: readonly string[];
}

export interface ManualIntakeRequest {
  intakeId: string;
  items: readonly ManualEntryItem[];
}

const MANUAL_DIMENSIONS_RE =
  /^(?:\d+(?:\.\d+)? (?:in|oz)|\d+(?:\.\d+)?x\d+(?:\.\d+)? in|gallon|quart|sandwich|snack)$/;

export function parseManualIntake(
  request: ManualIntakeRequest,
  opts: IntakeOptions,
): ParseOutcome {
  const profile = channelProfile("manual", opts);
  const items: ParsedItem[] = request.items.map((entry, index) => {
    const lexicon = getLexiconEntry(entry.productTypeSlug);
    if (!lexicon) {
      throw new ManualEntryValidationError(
        `unknown product type slug "${entry.productTypeSlug}" (manual entry uses the taxonomy picker, never free text)`,
      );
    }
    if (!Number.isInteger(entry.quantity) || entry.quantity <= 0) {
      throw new ManualEntryValidationError(
        `quantity must be a positive integer (item ${index})`,
      );
    }
    if (entry.dimensions != null && !MANUAL_DIMENSIONS_RE.test(entry.dimensions)) {
      throw new ManualEntryValidationError(
        `dimensions must be a normalized product descriptor (item ${index}) — free text is rejected`,
      );
    }
    if (entry.color != null && !(COLOR_WORDS as readonly string[]).includes(entry.color)) {
      throw new ManualEntryValidationError(
        `color must come from the controlled color vocabulary (item ${index})`,
      );
    }
    if (entry.material != null && !(MATERIAL_WORDS as readonly string[]).includes(entry.material)) {
      throw new ManualEntryValidationError(
        `material must come from the controlled material vocabulary (item ${index})`,
      );
    }
    const brandRequirement = entry.brandRequirement ?? "generic_allowed";
    if (brandRequirement !== "generic_allowed" && !entry.requiredBrandSlug) {
      throw new ManualEntryValidationError(
        `brandRequirement "${brandRequirement}" requires requiredBrandSlug (item ${index})`,
      );
    }
    const lineNumber = index + 1;
    const draft: ParsedRequirementDraft = {
      productTypeSlug: entry.productTypeSlug,
      quantity: entry.quantity,
      unit: entry.unit ?? lexicon.defaultUnit,
      packCount: entry.packCount ?? null,
      dimensions: entry.dimensions ?? null,
      material: entry.material ?? null,
      color: entry.color ?? null,
      rulingStyle: entry.rulingStyle ?? null,
      brandRequirement,
      requiredBrandSlug: entry.requiredBrandSlug ?? null,
      scope: LIST_SCOPE,
      durability: lexicon.durability,
      optionality: entry.optionality ?? "required",
      prohibitedSubstitutions: sanitizeProhibitedSubstitutions(
        entry.prohibitedSubstitutions ?? [],
      ),
      sourceKind: profile.sourceKind,
      // Direct structured entry, not extraction: user-asserted fields.
      sourceConfidence: 1,
    };
    return {
      lineNumber,
      originalText: `manual entry ${lineNumber}`,
      draft,
      fieldConfidences: { product: 1, quantity: 1, unit: 1, sourceConfidence: 1 },
      productCandidates: [],
      ambiguityFlags: [],
      needsReview: false,
      provenance: buildProvenance(profile, request.intakeId, lineNumber, 1, opts.clock),
    };
  });
  const redaction: PiiRedactionReport = {
    categoriesHit: [],
    counts: {},
    redactionCount: 0,
  };
  return finishOutcome(
    request.intakeId,
    profile,
    { items, skippedLineCount: 0 },
    redaction,
    opts,
  );
}

export class UploadUnavailableError extends Error {
  constructor(objectKey: string) {
    super(
      `Upload object "${objectKey}" is unavailable (never stored, already ` +
        `processed, or past the hard TTL). Ephemeral by design (SS1.7) — ` +
        `ask the user to re-upload.`,
    );
    this.name = "UploadUnavailableError";
  }
}

export interface UploadIntakeRequest {
  intakeId: string;
  objectKey: string;
  buffer: UploadBuffer;
  ocr: OcrEngine;
}

/**
 * Upload intake: buffer -> OCR -> redaction -> parse. The buffered object is
 * deleted in `finally` — success or failure — and tests verify the deletion
 * against the buffer, never assume it.
 */
export async function parseUploadIntake(
  request: UploadIntakeRequest,
  opts: IntakeOptions,
): Promise<ParseOutcome> {
  const buffered = await request.buffer.get(request.objectKey);
  if (!buffered) throw new UploadUnavailableError(request.objectKey);
  try {
    const ocrResult = await request.ocr.recognize({
      objectKey: request.objectKey,
      contentType: buffered.meta.contentType,
      bytes: buffered.bytes,
    });
    // OCR uncertainty is applied exactly ONCE, per line, via each line's own
    // page confidence (lineFactor below) — never a second time through the
    // channel profile, which would double-count it.
    const profile = channelProfile("upload", opts, ocrResult.engineVersion);
    // Page texts join into one document; track per-line OCR confidence.
    const pageOfLine: number[] = [];
    const pageConfidences: number[] = [];
    const rawText = ocrResult.pages
      .map((page, pageIndex) => {
        pageConfidences[pageIndex] = page.meanConfidence;
        const pageLines = page.text.split(/\r?\n/);
        for (let i = 0; i < pageLines.length; i += 1) pageOfLine.push(pageIndex);
        return page.text;
      })
      .join("\n");
    const { text, report } = redactPii(rawText);
    opts.logger?.({
      event: "intake_received",
      intakeId: request.intakeId,
      fields: {
        intakeMethod: "upload",
        objectKey: request.objectKey,
        pageCount: ocrResult.pages.length,
        ocrMeanConfidence: ocrResult.meanConfidence,
        redactionCount: report.redactionCount,
      },
    });
    const parsed = parseRedactedText({
      intakeId: request.intakeId,
      redactedText: text,
      profile,
      clock: opts.clock,
      lineFactor: (lineNumber) =>
        pageConfidences[pageOfLine[lineNumber - 1] ?? 0] ?? ocrResult.meanConfidence,
      lineForcesReview: (lineNumber) =>
        (pageConfidences[pageOfLine[lineNumber - 1] ?? 0] ?? 1) < OCR_REVIEW_THRESHOLD,
    });
    return finishOutcome(request.intakeId, profile, parsed, report, opts);
  } finally {
    // Ephemeral processing (SS1.7): the upload is gone when we leave here.
    await request.buffer.delete(request.objectKey);
    opts.logger?.({
      event: "upload_buffer_deleted",
      intakeId: request.intakeId,
      fields: { objectKey: request.objectKey },
    });
  }
}
