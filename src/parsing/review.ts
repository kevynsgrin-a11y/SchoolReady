/**
 * Mandatory human-review payload builder. The parser PROPOSES; the user
 * CONFIRMS (SS1.5). Every intake — paste, manual, upload — produces exactly
 * one ReviewPayload; nothing the parser emits may persist as
 * `user_confirmed` without the user acting on this payload.
 */
import type { IntakeMethod, IsoTimestamp } from "../contracts";
import { renderRequirementText } from "./render";
import type {
  ParsedItem,
  PiiRedactionReport,
  ReviewItem,
  ReviewPayload,
} from "./types";
import { PARSER_TRANSFORM_VERSION } from "./types";

const round2 = (n: number): number => Math.round(n * 100) / 100;

export function buildReviewPayload(args: {
  intakeId: string;
  intakeMethod: IntakeMethod;
  items: readonly ParsedItem[];
  redaction: PiiRedactionReport;
  skippedLineCount: number;
  parsedAt: IsoTimestamp;
  parserVersion?: string;
}): ReviewPayload {
  const items: ReviewItem[] = args.items.map((item) => ({
    lineNumber: item.lineNumber,
    originalText: item.originalText,
    proposed: item.draft.productTypeSlug === null ? null : item.draft,
    interpretation: renderRequirementText(item.draft),
    fieldConfidences: item.fieldConfidences,
    productCandidates: item.productCandidates,
    ambiguityFlags: item.ambiguityFlags,
    needsReview: item.needsReview,
  }));
  const confidences = args.items.map((i) => i.draft.sourceConfidence);
  return {
    intakeId: args.intakeId,
    intakeMethod: args.intakeMethod,
    parserVersion: args.parserVersion ?? PARSER_TRANSFORM_VERSION,
    parsedAt: args.parsedAt,
    requiresUserConfirmation: true,
    redaction: args.redaction,
    items,
    itemsNeedingReview: items.filter((i) => i.needsReview).length,
    skippedLineCount: args.skippedLineCount,
    overallConfidence:
      confidences.length === 0 ? 0 : round2(Math.min(...confidences)),
  };
}
