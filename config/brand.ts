/**
 * §0 Brand isolation. The working name is disposable — assume it changes once.
 *
 * This file is the ONLY place the brand name, wordmark, domain, and legal
 * entity strings may appear. Nothing else in the codebase hardcodes them;
 * everything references this module. Enforced by tests/config.test.ts
 * ("brand isolation" suite), which scans source directories for the literal.
 *
 * Domain updated 2026-08-04: real domain purchased through Cloudflare
 * Registrar per repository-owner instruction (docs/release/
 * backtoacademy-launch-runbook.md). Name/wordmark set to match. legalEntity
 * stays UNSET — no agent may invent a legal person; launch-checklist item 1
 * remains open until the repository owner supplies it.
 */
export const BRAND = {
  /** Working name. Disposable. */
  name: "Back to Academy",
  /** Wordmark string as rendered in the UI shell (Phase 7 replaces with the real mark). */
  wordmark: "Back to Academy",
  domain: "backtoacademy.com",
  /** No legal entity exists yet; repository owner owns replacing this (launch-checklist item 1). */
  legalEntity: "UNSET — no legal entity formed",
  supportEmail: "support@backtoacademy.com",
} as const;

export type Brand = typeof BRAND;
