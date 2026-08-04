/**
 * Phase 4 algorithm surface — one module per formula.
 *
 * §1.1: nothing in this directory imports from (or will ever import from) a
 * monetization path; tests/algorithms-independence.test.ts walks the
 * transitive import closure to keep that true when Phase 9 lands.
 */
export * from "./types";
export * from "./match";
export * from "./net-required";
export * from "./basket";
export * from "./capsule";
export * from "./trend";
export * from "./worth-it";
export * from "./deal-integrity";
export * from "./suppression";
