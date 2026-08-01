/**
 * §0 Brand isolation. The working name is disposable — assume it changes once.
 *
 * This file is the ONLY place the brand name, wordmark, domain, and legal
 * entity strings may appear. Nothing else in the codebase hardcodes them;
 * everything references this module. Enforced by tests/config.test.ts
 * ("brand isolation" suite), which scans source directories for the literal.
 */
export const BRAND = {
  /** Working name. Disposable. */
  name: "SchoolReady",
  /** Wordmark string as rendered in the UI shell (Phase 7 replaces with the real mark). */
  wordmark: "SchoolReady",
  /**
   * Not yet registered or selected. Deliberately an .example reserved domain
   * until launch; release-qa blocks launch while this remains .example.
   */
  domain: "schoolready.example",
  /** No legal entity exists yet; compliance-officer (Phase 10) owns replacing this. */
  legalEntity: "UNSET — no legal entity formed",
  supportEmail: "support@schoolready.example",
} as const;

export type Brand = typeof BRAND;
