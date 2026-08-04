/**
 * Phase 3 parsing pipeline — public surface.
 *
 * intake (paste | manual | upload) -> OCR (fixture engine only) -> PII
 * redaction -> normalization -> confidence scoring -> mandatory review
 * payload. See pipeline.ts for channel rules and SS1.4/SS1.5/SS1.7 gates.
 */
export * from "./types";
export * from "./pii";
export * from "./lexicon";
export { parseLine, CONFIDENCE } from "./parse-line";
export type { LineParse, ParsedLineCore } from "./parse-line";
export * from "./render";
export * from "./review";
export * from "./ocr";
export * from "./upload-buffer";
export * from "./pipeline";
