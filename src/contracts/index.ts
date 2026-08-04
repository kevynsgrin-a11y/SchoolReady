/**
 * Phase 1 data contracts — the types every other agent codes against.
 * Persistence shape lives in migrations/ (snake_case columns); these are the
 * camelCase domain records. tests/schema.test.ts keeps the vocabularies here
 * and the SQL CHECK constraints from drifting apart.
 */
export * from "./provenance";
export * from "./product";
export * from "./school";
export * from "./requirement";
export * from "./household";
export * from "./source";
export * from "./recall";
export * from "./tax-holiday";
export * from "./offer";
export * from "./constraint";
